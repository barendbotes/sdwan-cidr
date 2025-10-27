// @/lib/subnet-hierarchy.ts

import { CIDRMath } from "./cidr-math";

export interface SubnetLevel {
  name: string;
  prefix: number;
  cidr: string;
  networkAddress: string;
  broadcastAddress: string;
  totalAddresses: bigint;
  usableHosts: bigint;
  childCount: bigint; // Number of subnets at next level
}

export interface HierarchyConfig {
  supernet: string; // e.g., "10.0.0.0/8"
  levels: {
    name: string;
    prefix: number;
  }[];
}

export class SubnetHierarchy {
  private config: HierarchyConfig;
  private levels: SubnetLevel[][] = [];

  constructor(config: HierarchyConfig) {
    this.config = config;
    this.calculateHierarchy();
  }

  private calculateHierarchy(): void {
    const { ip: supIP, prefix: supPrefix } = CIDRMath.parseCIDR(
      this.config.supernet
    );

    this.levels = [];

    // Level 0: Supernet itself
    this.levels[0] = [
      {
        name: "Supernet",
        prefix: supPrefix,
        cidr: this.config.supernet,
        networkAddress: CIDRMath.getNetworkAddress(supIP, supPrefix),
        broadcastAddress: CIDRMath.getBroadcastAddress(supIP, supPrefix),
        totalAddresses: CIDRMath.subnetAddressCount(supPrefix),
        usableHosts: CIDRMath.usableHosts(supPrefix),
        childCount: CIDRMath.subnetCount(
          supPrefix,
          this.config.levels[1].prefix
        ),
      },
    ];

    // Generate each hierarchical level
    for (let levelIdx = 1; levelIdx < this.config.levels.length; levelIdx++) {
      const currentPrefix = this.config.levels[levelIdx].prefix;
      const parentPrefix = this.config.levels[levelIdx - 1].prefix;
      const nextPrefix =
        levelIdx + 1 < this.config.levels.length
          ? this.config.levels[levelIdx + 1].prefix
          : currentPrefix;

      this.levels[levelIdx] = [];

      // For each subnet in parent level, generate child subnets
      for (const parentSubnet of this.levels[levelIdx - 1]) {
        const subnetsPerParent = CIDRMath.subnetCount(
          parentPrefix,
          currentPrefix
        );

        for (let i = BigInt(0); i < subnetsPerParent; i++) {
          const childNetwork = CIDRMath.getNthSubnet(
            parentSubnet.networkAddress,
            parentPrefix,
            currentPrefix,
            i
          );

          this.levels[levelIdx].push({
            name: `${this.config.levels[levelIdx].name} ${
              this.levels[levelIdx].length + 1
            }`,
            prefix: currentPrefix,
            cidr: `${childNetwork}/${currentPrefix}`,
            networkAddress: childNetwork,
            broadcastAddress: CIDRMath.getBroadcastAddress(
              childNetwork,
              currentPrefix
            ),
            totalAddresses: CIDRMath.subnetAddressCount(currentPrefix),
            usableHosts: CIDRMath.usableHosts(currentPrefix),
            childCount: CIDRMath.subnetCount(currentPrefix, nextPrefix),
          });
        }
      }
    }
  }

  getLevel(levelIndex: number): SubnetLevel[] {
    return this.levels[levelIndex] || [];
  }

  getLevelSummary(levelIndex: number): {
    levelName: string;
    totalSubnets: bigint;
    totalAddresses: bigint;
    averageUsableHosts: bigint;
  } {
    const level = this.getLevel(levelIndex);
    if (level.length === 0)
      return {
        levelName: "",
        totalSubnets: BigInt(0),
        totalAddresses: BigInt(0),
        averageUsableHosts: BigInt(0),
      };

    const totalAddresses = level.reduce(
      (sum, subnet) => sum + subnet.totalAddresses,
      BigInt(0)
    );

    return {
      levelName: this.config.levels[levelIndex].name,
      totalSubnets: BigInt(level.length),
      totalAddresses,
      averageUsableHosts:
        totalAddresses > 0 ? totalAddresses / BigInt(level.length) : BigInt(0),
    };
  }

  getAllLevelsSummary(): ReturnType<SubnetHierarchy["getLevelSummary"]>[] {
    return this.config.levels.map((_, idx) => this.getLevelSummary(idx));
  }

  updateConfig(newConfig: Partial<HierarchyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.calculateHierarchy();
  }

  getHierarchyVisualization(): object {
    return {
      supernet: this.config.supernet,
      levels: this.config.levels.map((lvl, idx) => ({
        ...lvl,
        subnets: this.getLevel(idx).map((subnet) => ({
          cidr: subnet.cidr,
          range: `${subnet.networkAddress} - ${subnet.broadcastAddress}`,
          totalHosts: subnet.usableHosts.toString(),
        })),
        ...this.getLevelSummary(idx),
      })),
    };
  }
}
