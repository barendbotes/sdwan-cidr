import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Box, LayoutGrid, ArrowRight } from "lucide-react";
import type { AllocationResult } from "@/lib/hierarchical-allocator";
import { CIDRMath } from "@/lib/cidr-math";
import { cn } from "@/lib/utils";

interface HierarchyViewProps {
  result: AllocationResult;
  regionThemes: { name: string; code: string }[];
}

function TerritorySitePreview({
  siteId,
  cidr,
  vlanCount,
  label
}: {
  siteId: string;
  cidr: string;
  vlanCount: number;
  label: string;
}) {
  return (
    <div className="bg-background/50 rounded-lg border border-border/50 p-3 text-xs space-y-2 shadow-sm">
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
           <div className="w-1.5 h-1.5 rounded-full bg-primary/50"></div>
           {label}
        </span>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono bg-muted/50">{siteId}</Badge>
      </div>
      <div className="flex justify-between items-center border-t pt-2 border-dashed">
        <span className="font-mono text-primary font-medium">{cidr}</span>
        <span className="text-muted-foreground">{vlanCount} VLANs</span>
      </div>
    </div>
  );
}

export function HierarchyView({ result, regionThemes }: HierarchyViewProps) {
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const toggleRegion = (regionId: string) => {
    setExpandedRegions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(regionId)) {
        newSet.delete(regionId);
      } else {
        newSet.add(regionId);
      }
      return newSet;
    });
  };

  const getRegionCode = (regionName: string) => {
    const theme = regionThemes.find(t => t.name === regionName);
    return theme?.code || regionName.substring(0, 3).toUpperCase();
  };

  // Helper to pad site IDs dynamically based on capacity
  const formatSiteId = (code: string, subIndex: number, siteNum: number, maxSites: number) => {
    // Determine padding length based on maxSites (e.g., 1000 -> 4 digits, 100 -> 3 digits)
    const padding = maxSites.toString().length;
    // Ensure minimum of 3 digits for aesthetics
    const finalPadding = Math.max(3, padding); 
    const paddedNum = siteNum.toString().padStart(finalPadding, '0');
    return `${code}-T${subIndex + 1}-S${paddedNum}`;
  };

  return (
    <Card className="border-border/50 shadow-xl bg-card/40 backdrop-blur-xl pt-2">
      <CardHeader className="bg-muted/20 m-4 p-4 rounded-xl">
        <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-primary" />
            <CardTitle className="text-xl">Full Hierarchy Map</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4 px-6">
        {result.hierarchy.children
          ?.filter((r) => r.name !== "Unallocated")
          .map((region, index) => (
            <Collapsible
              key={region.id}
              open={expandedRegions.has(region.id)}
              onOpenChange={() => toggleRegion(region.id)}
              className="border rounded-xl bg-card/50 overflow-hidden transition-all duration-200 hover:border-primary/20 hover:shadow-md"
            >
              <CollapsibleTrigger className="w-full group">
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className={cn("p-2 rounded-lg bg-primary/5 text-primary transition-colors group-hover:bg-primary/10", expandedRegions.has(region.id) && "bg-primary text-primary-foreground")}>
                        <Box className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg tracking-tight">
                          {region.name}
                        </span>
                        <Badge variant="secondary" className="font-mono text-xs bg-muted/50 border-border">
                          {region.cidr}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        <span>{region.metadata?.sitesCapacity?.toLocaleString()} sites cap.</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40"></span>
                        <span className="font-mono opacity-75">{region.addressRange}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:block text-right mr-4">
                       <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Territories</div>
                       <div className="font-mono font-bold text-lg">{region.children?.length || 0}</div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-5 h-5 text-muted-foreground transition-transform duration-300",
                        expandedRegions.has(region.id) && "rotate-180 text-primary"
                      )}
                    />
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="border-t bg-muted/5 p-5">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {region.children?.map((subRegion, subIndex) => {
                        // Calculate site examples
                        const regionCode = getRegionCode(region.name);
                        const sitePrefix = result.sitePrefixRecommendation;
                        const { ip: subRegionIp, prefix: subRegionPrefix } = CIDRMath.parseCIDR(subRegion.cidr);
                        const maxSites = Number(CIDRMath.subnetCount(subRegionPrefix, sitePrefix));
                        
                        // First Site
                        const firstSiteCidr = CIDRMath.getNthSubnet(subRegionIp, subRegionPrefix, sitePrefix, BigInt(0));
                        // Dynamic Padding applied here
                        const firstSiteId = formatSiteId(regionCode, subIndex, 1, maxSites);
                        
                        // Last Site
                        const lastSiteCidr = CIDRMath.getNthSubnet(subRegionIp, subRegionPrefix, sitePrefix, BigInt(maxSites - 1));
                        // Dynamic Padding applied here
                        const lastSiteId = formatSiteId(regionCode, subIndex, maxSites, maxSites);

                        return (
                        <div
                            key={subRegion.id}
                            className="p-4 bg-background/80 rounded-xl border hover:border-primary/30 transition-all shadow-sm group/territory"
                        >
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-dashed">
                                <div className="flex items-center gap-2.5">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-xs font-bold text-muted-foreground group-hover/territory:bg-primary/10 group-hover/territory:text-primary transition-colors">{subIndex + 1}</span>
                                    <span className="text-sm font-bold text-foreground">{subRegion.name}</span>
                                </div>
                                <Badge variant="outline" className="font-mono text-xs border-primary/20 bg-primary/5 text-primary">
                                    {subRegion.cidr}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <TerritorySitePreview
                                    label="Range Start"
                                    siteId={firstSiteId}
                                    cidr={`${firstSiteCidr}/${sitePrefix}`}
                                    vlanCount={result.summary.vlansPerSite}
                                />
                                <TerritorySitePreview
                                    label="Range End"
                                    siteId={lastSiteId}
                                    cidr={`${lastSiteCidr}/${sitePrefix}`}
                                    vlanCount={result.summary.vlansPerSite}
                                />
                            </div>
                        </div>
                        );
                    })}
                    </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
      </CardContent>
    </Card>
  );
}