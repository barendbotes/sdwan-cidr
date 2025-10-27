// @/lib/dynamic-subnet-calculator.ts

import { CIDRMath } from "./cidr-math";

export interface SubnetSnapshot {
  supernet: string;
  supnetPrefix: number;
  vlanPrefix: number;
  totalVlans: bigint;
  totalAddresses: bigint;
  usableHostsPerVlan: bigint;
}

export class DynamicSubnetCalculator {
  private supernet: string;
  private vlanPrefix: number;

  constructor(supernet: string, vlanPrefix: number) {
    this.supernet = supernet;
    this.vlanPrefix = vlanPrefix;
    this.validate();
  }

  private validate(): void {
    const { prefix: supPrefix } = CIDRMath.parseCIDR(this.supernet);
    if (this.vlanPrefix < supPrefix) {
      throw new Error(
        `VLAN prefix (${this.vlanPrefix}) must be >= supernet prefix (${supPrefix})`
      );
    }
  }

  setSupernet(supernet: string): void {
    this.supernet = supernet;
    this.validate();
  }

  setVlanPrefix(prefix: number): void {
    this.vlanPrefix = prefix;
    this.validate();
  }

  getSnapshot(): SubnetSnapshot {
    const { prefix: supPrefix } = CIDRMath.parseCIDR(this.supernet);
    const totalVlans = CIDRMath.subnetCount(supPrefix, this.vlanPrefix);
    const totalAddresses = CIDRMath.subnetAddressCount(supPrefix);
    const usableHostsPerVlan = CIDRMath.usableHosts(this.vlanPrefix);

    return {
      supernet: this.supernet,
      supnetPrefix: supPrefix,
      vlanPrefix: this.vlanPrefix,
      totalVlans,
      totalAddresses,
      usableHostsPerVlan,
    };
  }

  // Calculate required supernet prefix for N sites with growth buffer
  calculateSupernetsForSites(
    siteCount: number,
    growthBuffer: number = 2 // 200%
  ): { requiredPrefix: number; recommendation: string } {
    const projectedSites = siteCount * growthBuffer;
    const { prefix: currentSupPrefix } = CIDRMath.parseCIDR(this.supernet);
    const vlanSnapshot = this.getSnapshot();

    const subnetsNeeded = BigInt(projectedSites) * BigInt(1); // 1 subnet per site (adjust as needed)
    let testPrefix = currentSupPrefix;

    while (testPrefix < 32) {
      const availableSubnets = CIDRMath.subnetCount(
        testPrefix,
        this.vlanPrefix
      );
      if (availableSubnets >= subnetsNeeded) {
        break;
      }
      testPrefix++;
    }

    return {
      requiredPrefix: testPrefix,
      recommendation: `For ${projectedSites} sites (${siteCount} + ${growthBuffer}x buffer), use /${testPrefix} to contain ${CIDRMath.subnetCount(
        testPrefix,
        this.vlanPrefix
      ).toString()} /24 subnets.`,
    };
  }

  // Generate VLAN assignments for a site
  generateSiteVlans(
    siteStartIp: string,
    vlansPerSite: number
  ): Array<{
    vlanId: number;
    cidr: string;
    network: string;
    broadcast: string;
    firstIp: string;
    lastIp: string;
    usableHosts: bigint;
  }> {
    const vlans = [];
    for (let i = 0; i < vlansPerSite; i++) {
      const vlanNetwork = CIDRMath.getNthSubnet(
        siteStartIp,
        this.vlanPrefix - 2, // Adjust for site-level granularity
        this.vlanPrefix,
        BigInt(i)
      );

      const { first, last } = CIDRMath.getHostRange(
        vlanNetwork,
        this.vlanPrefix
      );

      vlans.push({
        vlanId: i + 1,
        cidr: `${vlanNetwork}/${this.vlanPrefix}`,
        network: vlanNetwork,
        broadcast: CIDRMath.getBroadcastAddress(vlanNetwork, this.vlanPrefix),
        firstIp: first,
        lastIp: last,
        usableHosts: CIDRMath.usableHosts(this.vlanPrefix),
      });
    }
    return vlans;
  }
}
