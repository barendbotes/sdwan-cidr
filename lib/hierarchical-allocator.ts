// @/lib/hierarchical-allocator.ts

import { CIDRMath } from "./cidr-math";

export interface HierarchyLevel {
  id: string; // Unique identifier for React keys
  name: string;
  cidr: string;
  network: string;
  broadcast: string;
  addressRange: string;
  prefix: number;
  totalAddresses: bigint;
  usableHosts: bigint;
  children?: HierarchyLevel[];
  metadata?: {
    sitesCapacity?: number;
    sitePrefix?: number;
    ratio?: number;
    utilization?: number;
    code?: string;
  };
}

export interface RegionBias {
  name: string;
  ratio: number;
  code?: string;
}

export interface AllocationConfig {
  supernet: string;
  regionBiases: RegionBias[];
  subRegionsPerRegion: number;
  vlansPerSite: number;
  vlanSize: number;
  totalSitesNeeded: number;
  growthMultiplier: number;
}

export interface AllocationResult {
  hierarchy: HierarchyLevel;
  sitePrefixRecommendation: number;
  totalSitesSupported: number;
  totalSubnetsPerSite: number;
  utilizationPercentage: number;
  summary: {
    totalRegions: number;
    totalSubRegions: number;
    totalSitesSupported: number;
    vlansPerSite: number;
    regionBreakdown: Array<{
      name: string;
      ratio: number;
      sitesCapacity: number;
      percentage: number;
      cidr: string;
      code?: string;
    }>;
  };
  warnings?: string[];
  recommendations?: string[];
}

export class HierarchicalAllocator {
  private config: AllocationConfig;

  constructor(config: AllocationConfig) {
    this.config = config;
    this.validate();
  }

  private validate(): void {
    // Validate supernet
    CIDRMath.parseCIDR(this.config.supernet);

    // Validate ratios are powers of 2
    for (const region of this.config.regionBiases) {
      const ratio = region.ratio;
      if (ratio < 1 || !Number.isInteger(Math.log2(ratio))) {
        throw new Error(
          `Region "${region.name}" ratio ${ratio} must be a power of 2`
        );
      }
    }

    // Validate VLAN size
    if (this.config.vlanSize < 16 || this.config.vlanSize > 30) {
      throw new Error("VLAN size must be between /16 and /30");
    }

    // Validate VLANs per site
    if (this.config.vlansPerSite < 1 || this.config.vlansPerSite > 256) {
      throw new Error("VLANs per site must be between 1 and 256");
    }
  }

  private calculateSitePrefix(): number {
    const { vlansPerSite, vlanSize } = this.config;

    // Calculate required bits for VLANs
    const bitsNeeded = Math.ceil(Math.log2(vlansPerSite));
    let sitePrefix = vlanSize - bitsNeeded;

    // Ensure we don't go below reasonable limits
    if (sitePrefix < 16) {
      throw new Error(
        `Cannot fit ${vlansPerSite} VLANs of size /${vlanSize} in any reasonable site prefix`
      );
    }

    return sitePrefix;
  }

  private calculateRegionalPrefixes(): Array<{
    name: string;
    prefix: number;
    ratio: number;
    code?: string;
  }> {
    const { supernet, regionBiases } = this.config;
    const { prefix: supPrefix } = CIDRMath.parseCIDR(supernet);

    const totalRatio = regionBiases.reduce((sum, r) => sum + r.ratio, 0);
    const bitsNeeded = Math.ceil(Math.log2(totalRatio));

    return regionBiases.map((region) => {
      const bitsForRegion = Math.log2(region.ratio);
      const regionPrefix = supPrefix + bitsNeeded - bitsForRegion;

      return {
        name: region.name,
        prefix: Math.floor(regionPrefix),
        ratio: region.ratio,
        code: region.code,
      };
    });
  }

  private splitCIDR(
    parentCIDR: string,
    childCount: number,
    namePrefix: string,
    parentId: string
  ): HierarchyLevel[] {
    const { ip: parentIP, prefix: parentPrefix } =
      CIDRMath.parseCIDR(parentCIDR);
    const bitsNeeded = Math.ceil(Math.log2(childCount));
    const childPrefix = parentPrefix + bitsNeeded;

    if (childPrefix > 30) {
      throw new Error(
        `Cannot split ${parentCIDR} into ${childCount} subnets - would exceed /30`
      );
    }

    const childSize = CIDRMath.subnetAddressCount(childPrefix);
    const children: HierarchyLevel[] = [];
    const parentBase = CIDRMath.ipToNumber(parentIP);

    for (let i = 0; i < childCount; i++) {
      const childNetwork = CIDRMath.numberToIp(
        parentBase + BigInt(i) * childSize
      );
      const broadcast = CIDRMath.getBroadcastAddress(childNetwork, childPrefix);
      const { first, last } = CIDRMath.getHostRange(childNetwork, childPrefix);
      const totalAddresses = CIDRMath.subnetAddressCount(childPrefix);
      const usableHosts = CIDRMath.usableHosts(childPrefix);

      children.push({
        id: `${parentId}-${i}`,
        name: `${namePrefix} ${i + 1}`,
        cidr: `${childNetwork}/${childPrefix}`,
        network: childNetwork,
        broadcast,
        addressRange: `${first} - ${last}`,
        prefix: childPrefix,
        totalAddresses,
        usableHosts,
      });
    }

    return children;
  }

  allocate(): AllocationResult {
    const { supernet, regionBiases, subRegionsPerRegion } = this.config;
    const { prefix: supernetPrefix } = CIDRMath.parseCIDR(supernet);

    const sitePrefix = this.calculateSitePrefix();
    const warnings: string[] = [];
    const recommendations: string[] = [];

    const regionalPrefixes = this.calculateRegionalPrefixes();

    // Level 1: Supernet
    const supernetNetwork = CIDRMath.getNetworkAddress(
      supernet.split("/")[0],
      supernetPrefix
    );
    const supernetBroadcast = CIDRMath.getBroadcastAddress(
      supernetNetwork,
      supernetPrefix
    );
    const { first: supernetFirst, last: supernetLast } = CIDRMath.getHostRange(
      supernetNetwork,
      supernetPrefix
    );
    const supernetTotal = CIDRMath.subnetAddressCount(supernetPrefix);

    const hierarchy: HierarchyLevel = {
      id: "root",
      name: "Global Supernet",
      cidr: supernet,
      network: supernetNetwork,
      broadcast: supernetBroadcast,
      addressRange: `${supernetFirst} - ${supernetLast}`,
      prefix: supernetPrefix,
      totalAddresses: supernetTotal,
      usableHosts: CIDRMath.usableHosts(supernetPrefix),
      children: [],
    };

    // Level 2: Regions
    const regions: HierarchyLevel[] = [];
    const supernetBase = CIDRMath.ipToNumber(supernetNetwork);
    const supernetBroadcastNum = CIDRMath.ipToNumber(supernetBroadcast);
    let currentIpNum = supernetBase;

    for (let i = 0; i < regionBiases.length; i++) {
      const regionInfo = regionalPrefixes[i];
      const regionSize = CIDRMath.subnetAddressCount(regionInfo.prefix);

      // Align the region start to the next valid boundary for its prefix so
      // that regions are strictly non-overlapping within the supernet.
      let regionNetworkNum = currentIpNum;
      const remainder = regionNetworkNum % regionSize;
      if (remainder !== BigInt(0)) {
        regionNetworkNum = regionNetworkNum - remainder + regionSize;
      }

      if (regionNetworkNum + regionSize - BigInt(1) > supernetBroadcastNum) {
        throw new Error(
          "Region allocation exceeds supernet capacity - adjust supernet or region ratios"
        );
      }

      const regionNetwork = CIDRMath.numberToIp(regionNetworkNum);
      const broadcast = CIDRMath.getBroadcastAddress(
        regionNetwork,
        regionInfo.prefix
      );
      const { first, last } = CIDRMath.getHostRange(
        regionNetwork,
        regionInfo.prefix
      );
      const totalAddresses = CIDRMath.subnetAddressCount(regionInfo.prefix);

      regions.push({
        id: `region-${i}`,
        name: regionInfo.name,
        cidr: `${regionNetwork}/${regionInfo.prefix}`,
        network: regionNetwork,
        broadcast,
        addressRange: `${first} - ${last}`,
        prefix: regionInfo.prefix,
        totalAddresses,
        usableHosts: CIDRMath.usableHosts(regionInfo.prefix),
        metadata: {
          ratio: regionInfo.ratio,
          code: regionInfo.code,
        },
      });

      currentIpNum = regionNetworkNum + regionSize;
    }

    hierarchy.children = regions;

    // Check for unallocated space
    const totalAvailable = CIDRMath.subnetAddressCount(supernetPrefix);
    const totalAllocated = currentIpNum - supernetBase;

    if (totalAllocated < totalAvailable) {
      const unallocatedSize = totalAvailable - totalAllocated;
      const unallocatedNetworkNum = currentIpNum;
      const unallocatedNetwork = CIDRMath.numberToIp(unallocatedNetworkNum);

      let unallocPrefix = supernetPrefix;
      while (unallocPrefix <= 30) {
        const size = CIDRMath.subnetAddressCount(unallocPrefix);
        const remainder = unallocatedNetworkNum % size;
        if (size <= unallocatedSize && remainder === BigInt(0)) break;
        unallocPrefix++;
      }

      warnings.push(
        `${CIDRMath.formatSize(unallocatedSize)} addresses unallocated (${(
          (Number(unallocatedSize) / Number(totalAvailable)) *
          100
        ).toFixed(1)}%)`
      );

      const broadcast = CIDRMath.getBroadcastAddress(
        unallocatedNetwork,
        unallocPrefix
      );
      const { first, last } = CIDRMath.getHostRange(
        unallocatedNetwork,
        unallocPrefix
      );

      regions.push({
        id: "unallocated",
        name: "Unallocated",
        cidr: `${unallocatedNetwork}/${unallocPrefix}`,
        network: unallocatedNetwork,
        broadcast,
        addressRange: `${first} - ${last}`,
        prefix: unallocPrefix,
        totalAddresses: unallocatedSize,
        usableHosts: CIDRMath.usableHosts(unallocPrefix),
        metadata: { ratio: 0 },
      });
    }

    // Level 3: Sub-regions
    let totalSitesSupported = 0;
    const regionBreakdown: Array<{
      name: string;
      ratio: number;
      sitesCapacity: number;
      percentage: number;
      cidr: string;
    }> = [];

    for (const region of regions) {
      if (region.name === "Unallocated") {
        region.children = [];
        continue;
      }

      region.children = this.splitCIDR(
        region.cidr,
        subRegionsPerRegion,
        `${region.name} Territory`,
        region.id
      );

      let regionSitesTotal = 0;
      for (const subRegion of region.children) {
        const sitesPerSubRegion = Number(
          CIDRMath.subnetCount(subRegion.prefix, sitePrefix)
        );

        subRegion.metadata = {
          sitesCapacity: sitesPerSubRegion,
          sitePrefix: sitePrefix,
        };

        regionSitesTotal += sitesPerSubRegion;
      }

      totalSitesSupported += regionSitesTotal;

      regionBreakdown.push({
        name: region.name,
        ratio: region.metadata?.ratio || 0,
        sitesCapacity: regionSitesTotal,
        percentage:
          (Number(region.totalAddresses) / Number(totalAvailable)) * 100,
        cidr: region.cidr,
      });
    }

    const totalSubnetsPerSite = Number(
      CIDRMath.subnetCount(sitePrefix, this.config.vlanSize)
    );

    // Calculate utilization
    const utilizationPercentage =
      (this.config.totalSitesNeeded / totalSitesSupported) * 100;

    // Add recommendations
    if (utilizationPercentage > 80) {
      recommendations.push(
        "High utilization (>80%) - consider larger supernet for growth"
      );
    }

    if (utilizationPercentage < 20) {
      recommendations.push(
        "Low utilization (<20%) - consider smaller supernet to reduce waste"
      );
    }

    return {
      hierarchy,
      sitePrefixRecommendation: sitePrefix,
      totalSitesSupported,
      totalSubnetsPerSite,
      utilizationPercentage,
      summary: {
        totalRegions: regionBiases.length,
        totalSubRegions: regionBiases.length * subRegionsPerRegion,
        totalSitesSupported,
        vlansPerSite: this.config.vlansPerSite,
        regionBreakdown,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  generateSiteExample(
    subRegionCIDR: string,
    siteIndex: number
  ): HierarchyLevel {
    const sitePrefix = this.calculateSitePrefix();
    const { ip: subRegionIP, prefix: subRegionPrefix } =
      CIDRMath.parseCIDR(subRegionCIDR);

    const siteNetwork = CIDRMath.getNthSubnet(
      subRegionIP,
      subRegionPrefix,
      sitePrefix,
      BigInt(siteIndex)
    );

    const broadcast = CIDRMath.getBroadcastAddress(siteNetwork, sitePrefix);
    const { first, last } = CIDRMath.getHostRange(siteNetwork, sitePrefix);
    const totalAddresses = CIDRMath.subnetAddressCount(sitePrefix);

    const vlans: HierarchyLevel[] = [];
    const vlanCount = this.config.vlansPerSite;

    for (let i = 0; i < vlanCount; i++) {
      const vlanNetwork = CIDRMath.getNthSubnet(
        siteNetwork,
        sitePrefix,
        this.config.vlanSize,
        BigInt(i)
      );

      const vlanBroadcast = CIDRMath.getBroadcastAddress(
        vlanNetwork,
        this.config.vlanSize
      );
      const { first: vlanFirst, last: vlanLast } = CIDRMath.getHostRange(
        vlanNetwork,
        this.config.vlanSize
      );
      const vlanTotal = CIDRMath.subnetAddressCount(this.config.vlanSize);

      vlans.push({
        id: `site-${siteIndex}-vlan-${i}`,
        name: `VLAN ${i + 1}`,
        cidr: `${vlanNetwork}/${this.config.vlanSize}`,
        network: vlanNetwork,
        broadcast: vlanBroadcast,
        addressRange: `${vlanFirst} - ${vlanLast}`,
        prefix: this.config.vlanSize,
        totalAddresses: vlanTotal,
        usableHosts: CIDRMath.usableHosts(this.config.vlanSize),
      });
    }

    return {
      id: `site-${siteIndex}`,
      name: `Site ${siteIndex + 1}`,
      cidr: `${siteNetwork}/${sitePrefix}`,
      network: siteNetwork,
      broadcast,
      addressRange: `${first} - ${last}`,
      prefix: sitePrefix,
      totalAddresses,
      usableHosts: CIDRMath.usableHosts(sitePrefix),
      children: vlans,
    };
  }
}
