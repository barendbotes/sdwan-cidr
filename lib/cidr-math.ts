// @/lib/cidr-math.ts

export class CIDRMath {
  static ipToNumber(ip: string): bigint {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      throw new Error(`Invalid IP address: ${ip}`);
    }
    return (
      (BigInt(parts[0]) << BigInt(24)) |
      (BigInt(parts[1]) << BigInt(16)) |
      (BigInt(parts[2]) << BigInt(8)) |
      BigInt(parts[3])
    );
  }

  static numberToIp(num: bigint): string {
    const n = Number(num & BigInt(0xffffffff));
    return [
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    ].join(".");
  }

  static prefixToMask(prefix: number): bigint {
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      throw new Error(`Invalid prefix length: ${prefix}`);
    }
    return (BigInt(0xffffffff) << BigInt(32 - prefix)) & BigInt(0xffffffff);
  }

  static subnetAddressCount(prefix: number): bigint {
    if (prefix < 0 || prefix > 32) {
      throw new Error(`Invalid prefix: ${prefix}`);
    }
    return BigInt(1) << BigInt(32 - prefix);
  }

  static usableHosts(prefix: number): bigint {
    if (prefix === 32) return BigInt(1);
    if (prefix === 31) return BigInt(2);
    const count = this.subnetAddressCount(prefix);
    return count > 2 ? count - BigInt(2) : BigInt(0);
  }

  static parseCIDR(cidr: string): { ip: string; prefix: number } {
    const match = cidr.match(
      /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/
    );
    if (!match) throw new Error(`Invalid CIDR notation: ${cidr}`);

    const [, ip, prefixStr] = match;
    const prefix = parseInt(prefixStr, 10);

    if (prefix < 0 || prefix > 32) {
      throw new Error(`Invalid prefix length in CIDR: ${cidr}`);
    }

    this.ipToNumber(ip); // Validate IP
    return { ip, prefix };
  }

  static getNetworkAddress(ip: string, prefix: number): string {
    const ipNum = this.ipToNumber(ip);
    const mask = this.prefixToMask(prefix);
    return this.numberToIp(ipNum & mask);
  }

  static getBroadcastAddress(ip: string, prefix: number): string {
    const ipNum = this.ipToNumber(ip);
    const mask = this.prefixToMask(prefix);
    const hostMask = ~mask & BigInt(0xffffffff);
    return this.numberToIp((ipNum & mask) | hostMask);
  }

  static getHostRange(
    ip: string,
    prefix: number
  ): { first: string; last: string } {
    if (prefix === 32) {
      const network = this.getNetworkAddress(ip, prefix);
      return { first: network, last: network };
    }

    const network = this.getNetworkAddress(ip, prefix);
    const broadcast = this.getBroadcastAddress(ip, prefix);
    const networkNum = this.ipToNumber(network);
    const broadcastNum = this.ipToNumber(broadcast);

    return {
      first: this.numberToIp(networkNum + BigInt(1)),
      last: this.numberToIp(broadcastNum - BigInt(1)),
    };
  }

  static subnetCount(supernetPrefix: number, subnetPrefix: number): bigint {
    if (subnetPrefix < supernetPrefix) {
      throw new Error(
        `Subnet prefix (${subnetPrefix}) must be >= supernet prefix (${supernetPrefix})`
      );
    }
    return BigInt(1) << BigInt(subnetPrefix - supernetPrefix);
  }

  static getNthSubnet(
    supernetIp: string,
    supernetPrefix: number,
    subnetPrefix: number,
    index: bigint
  ): string {
    if (index < 0) {
      throw new Error(`Subnet index must be non-negative: ${index}`);
    }

    const maxSubnets = this.subnetCount(supernetPrefix, subnetPrefix);
    if (index >= maxSubnets) {
      throw new Error(
        `Subnet index ${index} exceeds maximum ${maxSubnets - BigInt(1)}`
      );
    }

    const subnetSize = this.subnetAddressCount(subnetPrefix);
    const offset = subnetSize * index;
    const supernetNum = this.ipToNumber(
      this.getNetworkAddress(supernetIp, supernetPrefix)
    );
    return this.numberToIp(supernetNum + offset);
  }

  static isIpInCidr(ip: string, cidr: string): boolean {
    try {
      const { ip: cidrIp, prefix } = this.parseCIDR(cidr);
      const network = this.getNetworkAddress(cidrIp, prefix);
      const broadcast = this.getBroadcastAddress(cidrIp, prefix);
      const ipNum = this.ipToNumber(ip);
      const networkNum = this.ipToNumber(network);
      const broadcastNum = this.ipToNumber(broadcast);
      return ipNum >= networkNum && ipNum <= broadcastNum;
    } catch {
      return false;
    }
  }

  // Additional utility methods
  static formatSize(addresses: bigint): string {
    const num = Number(addresses);
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toLocaleString();
  }

  static cidrToRange(cidr: string): string {
    const { ip, prefix } = this.parseCIDR(cidr);
    const network = this.getNetworkAddress(ip, prefix);
    const broadcast = this.getBroadcastAddress(ip, prefix);
    return `${network} - ${broadcast}`;
  }
}
