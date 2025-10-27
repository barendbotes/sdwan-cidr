// @/lib/regional-allocator.ts

import { CIDRMath } from "./cidr-math";

export interface RegionConfig {
  name: string;
  prefixBits: number; // How many bits this region gets (e.g., /10 = 2 bits from /8)
}

export interface RegionalAllocation {
  regionName: string;
  prefix: number;
  cidr: string;
  network: string;
  broadcast: string;
  addressRange: string;
  capacitySubnets: bigint;
  allocatedBits: number;
  percentageOfSupernet: number;
}

export class RegionalAllocator {
  private supernet: string;
  private regions: RegionConfig[];
  private vlanPrefix: number;

  constructor(supernet: string, regions: RegionConfig[], vlanPrefix: number) {
    this.supernet = supernet;
    this.regions = regions;
    this.vlanPrefix = vlanPrefix;
    this.validateBitAllocation();
  }

  private validateBitAllocation(): void {
    const { prefix: supPrefix } = CIDRMath.parseCIDR(this.supernet);
    const availableBits = 32 - supPrefix;

    const totalAllocatedBits = this.regions.reduce(
      (sum, r) => sum + Math.pow(2, r.prefixBits),
      0
    );
    const totalPossible = Math.pow(2, availableBits);

    if (totalAllocatedBits > totalPossible) {
      throw new Error(
        `Bit allocation exceeds supernet capacity. ` +
          `Allocated: ${totalAllocatedBits}, Available: ${totalPossible}`
      );
    }
  }

  // Calculate how many bits are still unallocated
  getUnallocatedBits(): number {
    const { prefix: supPrefix } = CIDRMath.parseCIDR(this.supernet);
    const availableBits = 32 - supPrefix;
    const totalPossible = Math.pow(2, availableBits);

    const totalAllocated = this.regions.reduce(
      (sum, r) => sum + Math.pow(2, r.prefixBits),
      0
    );

    return totalPossible - totalAllocated;
  }

  allocateRegions(): RegionalAllocation[] {
    const { ip: supIP, prefix: supPrefix } = CIDRMath.parseCIDR(this.supernet);
    const allocations: RegionalAllocation[] = [];
    const supernetBase = CIDRMath.ipToNumber(supIP);
    const totalAddresses = CIDRMath.subnetAddressCount(supPrefix);

    let currentOffset = BigInt(0);

    for (const region of this.regions) {
      const regionPrefix = supPrefix + region.prefixBits;
      const regionSize = CIDRMath.subnetAddressCount(regionPrefix);

      const regionNetwork = CIDRMath.numberToIp(supernetBase + currentOffset);
      const broadcast = CIDRMath.getBroadcastAddress(
        regionNetwork,
        regionPrefix
      );
      const { first, last } = CIDRMath.getHostRange(
        regionNetwork,
        regionPrefix
      );
      const capacitySubnets = CIDRMath.subnetCount(
        regionPrefix,
        this.vlanPrefix
      );

      const percentageOfSupernet =
        (Number(regionSize) / Number(totalAddresses)) * 100;

      allocations.push({
        regionName: region.name,
        prefix: regionPrefix,
        cidr: `${regionNetwork}/${regionPrefix}`,
        network: regionNetwork,
        broadcast,
        addressRange: `${first} - ${last}`,
        capacitySubnets,
        allocatedBits: region.prefixBits,
        percentageOfSupernet,
      });

      currentOffset += regionSize;
    }

    // If there's unallocated space, add it
    const unallocatedBits = this.getUnallocatedBits();
    if (unallocatedBits > 0) {
      // Find the largest power-of-2 block that fits
      let unallocatedPrefix = supPrefix;
      while (Math.pow(2, 32 - unallocatedPrefix) > unallocatedBits) {
        unallocatedPrefix++;
      }

      const regionNetwork = CIDRMath.numberToIp(supernetBase + currentOffset);
      const broadcast = CIDRMath.getBroadcastAddress(
        regionNetwork,
        unallocatedPrefix
      );
      const { first, last } = CIDRMath.getHostRange(
        regionNetwork,
        unallocatedPrefix
      );
      const regionSize = CIDRMath.subnetAddressCount(unallocatedPrefix);
      const capacitySubnets = CIDRMath.subnetCount(
        unallocatedPrefix,
        this.vlanPrefix
      );
      const percentageOfSupernet =
        (Number(regionSize) / Number(totalAddresses)) * 100;

      allocations.push({
        regionName: "Unallocated",
        prefix: unallocatedPrefix,
        cidr: `${regionNetwork}/${unallocatedPrefix}`,
        network: regionNetwork,
        broadcast,
        addressRange: `${first} - ${last}`,
        capacitySubnets,
        allocatedBits: 32 - unallocatedPrefix - supPrefix,
        percentageOfSupernet,
      });
    }

    return allocations;
  }

  updateRegionBits(regionName: string, newPrefixBits: number): void {
    const region = this.regions.find((r) => r.name === regionName);
    if (!region) throw new Error(`Region not found: ${regionName}`);
    region.prefixBits = newPrefixBits;
    this.validateBitAllocation();
  }

  // Helper: distribute remaining bits equally among regions
  autoBalanceUnallocated(): void {
    const unallocatedBits = this.getUnallocatedBits();
    if (unallocatedBits <= 0) return;

    const bitsPerRegion = Math.floor(unallocatedBits / this.regions.length);

    for (const region of this.regions) {
      region.prefixBits = Math.log2(
        Math.pow(2, region.prefixBits) + bitsPerRegion
      );
    }
  }
}
