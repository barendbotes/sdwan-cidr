// @/app/page.tsx

"use client";

import { useState, useMemo } from "react";
import {
  HierarchicalAllocator,
  RegionBias,
  AllocationResult,
} from "@/lib/hierarchical-allocator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Network,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Lightbulb,
} from "lucide-react";
import { CIDRMath } from "@/lib/cidr-math";

const REGION_NAMES = ["EMEA", "APAC", "NA", "LATAM", "AFRICA", "MENA"];

const PRESET_SUPERNETS = [
  { label: "10.0.0.0/8 (Class A)", value: "10.0.0.0/8" },
  { label: "172.16.0.0/12 (Class B)", value: "172.16.0.0/12" },
  { label: "192.168.0.0/16 (Class C)", value: "192.168.0.0/16" },
];

export default function Home() {
  const [supernet, setSupernet] = useState("10.0.0.0/8");
  const [regionCount, setRegionCount] = useState(4);
  const [subRegionsPerRegion, setSubRegionsPerRegion] = useState(2);
  const [vlansPerSite, setVlansPerSite] = useState(5);
  const [vlanSize, setVlanSize] = useState(24);
  const [result, setResult] = useState<AllocationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regionRatios, setRegionRatios] = useState<number[]>([1, 1, 1, 1]);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(
    new Set()
  );

  const updateRegionCount = (count: number) => {
    setRegionCount(count);
    setRegionRatios(Array(count).fill(1));
  };

  const updateRegionRatio = (index: number, ratio: number) => {
    const newRatios = [...regionRatios];
    newRatios[index] = ratio;
    setRegionRatios(newRatios);
  };

  const totalRatio = useMemo(
    () => regionRatios.reduce((sum, r) => sum + r, 0),
    [regionRatios]
  );

  const calculate = () => {
    try {
      setError(null);

      const regionBiases: RegionBias[] = Array.from(
        { length: regionCount },
        (_, i) => ({
          name: REGION_NAMES[i] || `Region ${i + 1}`,
          ratio: regionRatios[i] || 1,
        })
      );

      const allocator = new HierarchicalAllocator({
        supernet,
        regionBiases,
        subRegionsPerRegion,
        vlansPerSite,
        vlanSize,
        totalSitesNeeded: 1000,
        growthMultiplier: 3,
      });

      const allocation = allocator.allocate();
      setResult(allocation);
    } catch (err: any) {
      setError(err.message);
      setResult(null);
    }
  };

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

  const getUtilizationColor = (percentage: number) => {
    if (percentage > 80) return "text-red-600";
    if (percentage > 60) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto p-4 md:p-8 space-y-6 max-w-7xl">
        {/* Header */}
        <div className="text-center space-y-2 py-6">
          <div className="flex items-center justify-center gap-3">
            <Network className="w-10 h-10 text-blue-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Network Subnet Design Tool
            </h1>
          </div>
          <p className="text-muted-foreground">
            Design hierarchical IP address allocation for global deployments
          </p>
        </div>

        {/* Configuration Card */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="w-5 h-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Supernet Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">
                Supernet Address
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Input
                    value={supernet}
                    onChange={(e) => setSupernet(e.target.value)}
                    placeholder="10.0.0.0/8"
                    className="font-mono"
                  />
                  {supernet && (
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        try {
                          const { prefix } = CIDRMath.parseCIDR(supernet);
                          const total = CIDRMath.subnetAddressCount(prefix);
                          return `${CIDRMath.formatSize(
                            total
                          )} total addresses`;
                        } catch {
                          return "Invalid CIDR";
                        }
                      })()}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Quick Presets
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_SUPERNETS.map((preset) => (
                      <Button
                        key={preset.value}
                        variant="outline"
                        size="sm"
                        onClick={() => setSupernet(preset.value)}
                        className="text-xs"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Grid Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Number of Regions</Label>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={regionCount}
                  onChange={(e) =>
                    updateRegionCount(parseInt(e.target.value) || 1)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Geographic regions (max 6)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Territories per Region</Label>
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={subRegionsPerRegion}
                  onChange={(e) =>
                    setSubRegionsPerRegion(parseInt(e.target.value) || 1)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Sub-divisions within each region
                </p>
              </div>

              <div className="space-y-2">
                <Label>VLANs per Site</Label>
                <Input
                  type="number"
                  min={1}
                  max={64}
                  value={vlansPerSite}
                  onChange={(e) =>
                    setVlansPerSite(parseInt(e.target.value) || 1)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Network segments per location
                </p>
              </div>
            </div>

            {/* VLAN Size */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>VLAN Subnet Size: /{vlanSize}</Label>
                <Badge variant="secondary">
                  {CIDRMath.formatSize(CIDRMath.usableHosts(vlanSize))} hosts
                </Badge>
              </div>
              <Slider
                value={[vlanSize]}
                onValueChange={([val]) => setVlanSize(val)}
                min={20}
                max={28}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>/20 (4K hosts)</span>
                <span>/24 (254 hosts)</span>
                <span>/28 (14 hosts)</span>
              </div>
            </div>

            {/* Regional Bias */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold">Regional Capacity Bias</h3>
                  <p className="text-sm text-muted-foreground">
                    Allocate more addresses to regions with higher ratios
                  </p>
                </div>
                <Badge variant="outline">Total Ratio: {totalRatio}</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: regionCount }).map((_, i) => (
                  <div key={i} className="space-y-2 p-3 bg-muted/30 rounded-lg">
                    <div className="flex justify-between items-center">
                      <Label className="font-semibold">
                        {REGION_NAMES[i] || `Region ${i + 1}`}
                      </Label>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {regionRatios[i]}x (
                        {((regionRatios[i] / totalRatio) * 100).toFixed(0)}%)
                      </Badge>
                    </div>
                    <Slider
                      value={[Math.log2(regionRatios[i])]}
                      onValueChange={([val]) =>
                        updateRegionRatio(i, Math.pow(2, val))
                      }
                      min={0}
                      max={3}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1x</span>
                      <span>2x</span>
                      <span>4x</span>
                      <span>8x</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Calculate Button */}
            <Button onClick={calculate} className="w-full" size="lg">
              <Network className="w-4 h-4 mr-2" />
              Calculate Subnet Hierarchy
            </Button>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Configuration Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Warnings & Recommendations */}
            {(result.warnings || result.recommendations) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.warnings && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Warnings</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside space-y-1">
                        {result.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {result.recommendations && (
                  <Alert>
                    <Lightbulb className="h-4 w-4" />
                    <AlertTitle>Recommendations</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside space-y-1">
                        {result.recommendations.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Site Prefix
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    /{result.sitePrefixRecommendation}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.totalSubnetsPerSite} VLANs per site
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Sites
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {result.totalSitesSupported.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Across all regions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Utilization
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-2xl font-bold ${getUtilizationColor(
                      result.utilizationPercentage
                    )}`}
                  >
                    {result.utilizationPercentage.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on 1000 sites needed
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Regions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {result.summary.totalRegions}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.summary.totalSubRegions} territories
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Results Tabs */}
            <Card>
              <Tabs defaultValue="breakdown" className="w-full">
                <CardHeader>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="breakdown">
                      Regional Breakdown
                    </TabsTrigger>
                    <TabsTrigger value="hierarchy">Full Hierarchy</TabsTrigger>
                  </TabsList>
                </CardHeader>

                <CardContent>
                  <TabsContent value="breakdown" className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-semibold">
                              Region
                            </th>
                            <th className="text-left p-3 font-semibold">
                              CIDR
                            </th>
                            <th className="text-right p-3 font-semibold">
                              Ratio
                            </th>
                            <th className="text-right p-3 font-semibold">
                              Sites
                            </th>
                            <th className="text-right p-3 font-semibold">
                              % of Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.summary.regionBreakdown.map((r) => (
                            <tr
                              key={r.name}
                              className="border-b hover:bg-muted/50"
                            >
                              <td className="p-3">
                                <Badge variant="outline">{r.name}</Badge>
                              </td>
                              <td className="p-3 font-mono text-sm">
                                {r.cidr}
                              </td>
                              <td className="text-right p-3">{r.ratio}x</td>
                              <td className="text-right p-3 font-mono">
                                {r.sitesCapacity.toLocaleString()}
                              </td>
                              <td className="text-right p-3">
                                <Badge variant="secondary">
                                  {r.percentage.toFixed(1)}%
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  <TabsContent value="hierarchy" className="space-y-4">
                    {result.hierarchy.children
                      ?.filter((r) => r.name !== "Unallocated")
                      .map((region) => (
                        <Collapsible
                          key={region.id}
                          open={expandedRegions.has(region.id)}
                          onOpenChange={() => toggleRegion(region.id)}
                        >
                          <Card className="overflow-hidden">
                            <CollapsibleTrigger asChild>
                              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <ChevronDown
                                      className={`w-5 h-5 transition-transform ${
                                        expandedRegions.has(region.id)
                                          ? "rotate-180"
                                          : ""
                                      }`}
                                    />
                                    <div>
                                      <CardTitle className="text-lg">
                                        {region.name}
                                      </CardTitle>
                                      <p className="text-sm text-muted-foreground font-mono mt-1">
                                        {region.cidr}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Badge variant="outline">
                                      {region.metadata?.ratio}x ratio
                                    </Badge>
                                    <Badge variant="secondary">
                                      {CIDRMath.formatSize(
                                        region.totalAddresses
                                      )}{" "}
                                      addresses
                                    </Badge>
                                  </div>
                                </div>
                              </CardHeader>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <CardContent className="pt-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">
                                      Network:
                                    </span>
                                    <span className="font-mono ml-2">
                                      {region.network}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">
                                      Broadcast:
                                    </span>
                                    <span className="font-mono ml-2">
                                      {region.broadcast}
                                    </span>
                                  </div>
                                </div>

                                <div className="border-t pt-3 mt-3">
                                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                                    <Info className="w-4 h-4" />
                                    Territories
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {region.children?.map((subRegion) => (
                                      <div
                                        key={subRegion.id}
                                        className="p-3 bg-muted/30 rounded-lg space-y-2"
                                      >
                                        <div className="flex justify-between items-start">
                                          <h5 className="font-medium">
                                            {subRegion.name}
                                          </h5>
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            {subRegion.metadata?.sitesCapacity}{" "}
                                            sites
                                          </Badge>
                                        </div>
                                        <p className="font-mono text-xs text-muted-foreground">
                                          {subRegion.cidr}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {subRegion.addressRange}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </CardContent>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      ))}
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
