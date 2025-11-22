import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Laptop, MonitorSmartphone, Server } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CIDRMath } from "@/lib/cidr-math";
import type { AllocationResult } from "@/lib/hierarchical-allocator";

interface SiteExampleVlan {
  cidr: string;
  network: string;
  broadcast: string;
  addressRange: string;
  usableHosts: number;
}

interface SiteExample {
  cidr: string;
  network: string;
  broadcast: string;
  addressRange: string;
  vlans: SiteExampleVlan[];
  warning?: string;
}

interface SiteExampleProps {
  allocation: AllocationResult;
  vlanSize: number;
  vlansPerSite: number;
  vlanPrefixes: number[];
  totalSites: number; // Added this prop
  updateVlanPrefix: (index: number, prefix: number) => void;
  regionThemes: { name: string; code: string }[];
}

// Helper logic for calculating the specific breakdown
function buildSiteExample(
  allocation: AllocationResult,
  defaultVlanPrefix: number,
  vlansPerSite: number,
  vlanPrefixes?: number[]
): SiteExample | null {
  const regions = allocation.hierarchy.children;
  if (!regions || regions.length === 0) return null;

  const region =
    regions.find((r) => r.name !== "Unallocated" && r.children && r.children.length > 0) ?? regions[0];
  const subRegion = region.children && region.children[0];
  if (!subRegion) return null;

  const { ip: subRegionIp, prefix: subRegionPrefix } = CIDRMath.parseCIDR(subRegion.cidr);
  const sitePrefix = allocation.sitePrefixRecommendation;
  const siteNetwork = CIDRMath.getNthSubnet(subRegionIp, subRegionPrefix, sitePrefix, BigInt(0));
  const siteBroadcast = CIDRMath.getBroadcastAddress(siteNetwork, sitePrefix);
  const { first: siteFirst, last: siteLast } = CIDRMath.getHostRange(siteNetwork, sitePrefix);

  const vlans: SiteExampleVlan[] = [];
  const siteBaseNum = CIDRMath.ipToNumber(siteNetwork);
  const siteBroadcastNum = CIDRMath.ipToNumber(siteBroadcast);
  const prefixes =
    vlanPrefixes && vlanPrefixes.length > 0
      ? vlanPrefixes
      : Array.from({ length: vlansPerSite }, () => defaultVlanPrefix);

  let currentIpNum = siteBaseNum;
  let allocatedVlans = 0;

  for (let i = 0; i < vlansPerSite; i++) {
    const prefix = prefixes[i] ?? defaultVlanPrefix;
    const vlanSizeBig = CIDRMath.subnetAddressCount(prefix);

    let vlanNetworkNum = currentIpNum;
    const remainder = vlanNetworkNum % vlanSizeBig;
    if (remainder !== BigInt(0)) {
      vlanNetworkNum = vlanNetworkNum - remainder + vlanSizeBig;
    }

    if (vlanNetworkNum + vlanSizeBig - BigInt(1) > siteBroadcastNum) {
      break;
    }

    const vlanNetwork = CIDRMath.numberToIp(vlanNetworkNum);
    const vlanBroadcast = CIDRMath.getBroadcastAddress(vlanNetwork, prefix);
    const { first, last } = CIDRMath.getHostRange(vlanNetwork, prefix);

    vlans.push({
      cidr: `${vlanNetwork}/${prefix}`,
      network: vlanNetwork,
      broadcast: vlanBroadcast,
      addressRange: `${first} - ${last}`,
      usableHosts: Number(CIDRMath.usableHosts(prefix)),
    });

    allocatedVlans++;
    currentIpNum = vlanNetworkNum + vlanSizeBig;
  }

  const totalSiteAddresses = CIDRMath.subnetAddressCount(sitePrefix);
  const usedAddresses = currentIpNum - siteBaseNum;
  const remainingAddresses = totalSiteAddresses - usedAddresses;

  let warning: string | undefined;
  if (allocatedVlans < vlansPerSite) {
    warning = `Capacity Limit: Only ${allocatedVlans} of ${vlansPerSite} VLANs fit in the /${sitePrefix} site block.`;
  } else {
    const minVlanSize = prefixes.reduce<bigint>((min, p) => {
      const size = CIDRMath.subnetAddressCount(p);
      return min === BigInt(0) || size < min ? size : min;
    }, BigInt(0));

    if (minVlanSize > BigInt(0) && remainingAddresses > BigInt(0) && remainingAddresses < minVlanSize * BigInt(2)) {
      warning = `High Utilization: Only ${CIDRMath.formatSize(remainingAddresses)} addresses remain in the site block.`;
    }
  }

  return {
    cidr: `${siteNetwork}/${sitePrefix}`,
    network: siteNetwork,
    broadcast: siteBroadcast,
    addressRange: `${siteFirst} - ${siteLast}`,
    vlans,
    warning,
  };
}

export function SiteExample(props: SiteExampleProps) {
  const { allocation, vlanSize, vlansPerSite, vlanPrefixes, totalSites, updateVlanPrefix, regionThemes } = props;
  const siteExample = buildSiteExample(allocation, vlanSize, vlansPerSite, vlanPrefixes);

  if (!siteExample) return null;

  const theme = regionThemes[0];
  
  // Logic for dynamic padding
  const paddingLength = Math.max(3, totalSites.toString().length);
  const paddedId = "1".padStart(paddingLength, '0');
  const exampleSiteId = theme ? `${theme.code}-S${paddedId}` : `XXX-S${paddedId}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Configuration Column */}
      <Card className="lg:col-span-1 border-border/50 bg-card/40 backdrop-blur-sm shadow-lg flex flex-col pt-2">
      <CardHeader className="bg-muted/20 m-4 p-4 rounded-xl">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            VLAN Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6 flex-1 flex flex-col">
          <div className="space-y-2">
             <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Site ID Format</div>
             <div className="p-3 rounded-md bg-muted/40 font-mono text-sm border border-border/50 text-center">
                 {exampleSiteId}
             </div>
          </div>

          {vlanPrefixes.length > 0 && (
            <div className="space-y-4 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Custom Subnet Sizes</span>
                  <Badge variant="outline" className="text-[10px] bg-background/50">Adjustable</Badge>
              </div>
              
              <ScrollArea className="flex-1 h-[300px] -mr-4 pr-4">
                <div className="space-y-5 pb-4">
                  {vlanPrefixes.map((prefix, index) => (
                    <div key={index} className="space-y-2.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-medium">VLAN {index + 1}</span>
                        <span className="font-mono text-primary bg-primary/10 px-1.5 rounded">/{prefix}</span>
                      </div>
                      <Slider
                        value={[prefix]}
                        onValueChange={([val]) => updateVlanPrefix(index, val)}
                        min={allocation.sitePrefixRecommendation}
                        max={30}
                        step={1}
                        className="w-full"
                      />
                      <div className="text-[10px] text-right text-muted-foreground font-mono">
                        {CIDRMath.formatSize(CIDRMath.usableHosts(prefix))} usable hosts
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              {siteExample.warning && (
                <Alert variant="destructive" className="text-xs py-3 bg-destructive/10 border-destructive/20">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <AlertDescription className="ml-2">{siteExample.warning}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visualization Column */}
      <Card className="lg:col-span-2 border-border/50 bg-card/40 backdrop-blur-sm shadow-lg pt-2">
        <CardHeader className="m-4 p-4 bg-muted/10 flex flex-row justify-between items-center rounded-xl">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Site Blueprint
          </CardTitle>
          <Badge variant="secondary" className="font-mono text-xs border-primary/20 bg-primary/5 text-primary">
            {siteExample.cidr}
          </Badge>
        </CardHeader>
        <CardContent className="pt-6">
            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {siteExample.vlans.map((vlan, index) => (
                        <div key={vlan.cidr} className="group relative overflow-hidden rounded-xl border bg-background/50 p-4 transition-all hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5">
                            {/* FIXED: Moved icon to bottom-right (-bottom-2 -right-2) to avoid text overlap */}
                            <div className="absolute -bottom-2 -right-2 p-3 opacity-5 group-hover:opacity-10 transition-opacity duration-500 rotate-12">
                                {index === 0 ? <Server className="w-16 h-16 text-primary" /> : 
                                 index === 1 ? <MonitorSmartphone className="w-16 h-16 text-primary" /> :
                                 <Laptop className="w-16 h-16 text-primary" />}
                            </div>
                            
                            <div className="flex justify-between items-center mb-3 relative z-10">
                                <Badge variant="outline" className="bg-primary/5 border-primary/10 text-primary text-[10px] font-bold">
                                    VLAN {index + 1}
                                </Badge>
                                <span className="text-[10px] font-mono text-muted-foreground font-medium bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded">
                                    {vlan.usableHosts} hosts
                                </span>
                            </div>
                            <div className="font-mono text-base font-bold tracking-tight relative z-10">{vlan.cidr}</div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-1.5 truncate relative z-10 opacity-80">
                                {vlan.addressRange}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 rounded-lg bg-muted/30 border border-dashed text-xs text-center text-muted-foreground">
                    Remaining space in site block: {allocation.sitePrefixRecommendation < 30 ? "Available for future expansion" : "Fully Allocated"}
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}