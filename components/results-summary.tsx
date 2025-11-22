import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb, Copy, Check, PieChart, ShieldAlert, Activity, Info } from "lucide-react";
import type { AllocationResult } from "@/lib/hierarchical-allocator";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface ResultsSummaryProps {
  result: AllocationResult;
  sitesNeeded: number;
}

export function ResultsSummary({ result, sitesNeeded }: ResultsSummaryProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const summary = {
      supernet: result.hierarchy.cidr,
      totalSites: result.totalSitesSupported,
      utilization: result.utilizationPercentage,
      regions: result.summary.regionBreakdown
    };
    navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalRatio = result.summary.regionBreakdown.reduce((acc, r) => acc + r.ratio, 0);
  
  // Separate critical warnings from informational unallocated messages
  const criticalWarnings = result.warnings?.filter(w => !w.toLowerCase().includes("unallocated")) || [];
  const unallocatedInfo = result.warnings?.filter(w => w.toLowerCase().includes("unallocated")) || [];
  const totalAllocationPercentage = result.summary.regionBreakdown.reduce((acc, r) => acc + r.percentage, 0);

  return (
    <div className="space-y-6">
      
      {/* Action Bar */}
      <div className="flex justify-between items-end mb-2">
         <div className="space-y-1">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Analysis Results
            </h2>
         </div>
         <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2 text-xs h-8">
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Export JSON"}
         </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
            label="Site Prefix" 
            value={`/${result.sitePrefixRecommendation}`} 
            subtext={`${result.totalSubnetsPerSite} subnets capacity`}
            highlight
        />
        <MetricCard 
            label="Total Sites" 
            value={result.totalSitesSupported.toLocaleString()} 
            subtext="Global capacity"
        />
        <MetricCard 
            label="Est. Utilization" 
            value={`${result.utilizationPercentage.toFixed(1)}%`} 
            subtext={`Based on ${sitesNeeded} sites`}
            color={result.utilizationPercentage > 80 ? "text-destructive" : "text-emerald-500"}
        />
         <MetricCard 
            label="Hierarchy Depth" 
            value={`${result.summary.totalRegions}`} 
            subtext={`${result.summary.totalSubRegions} Territories`}
        />
      </div>

      {/* Alerts Grid */}
      {(criticalWarnings.length > 0 || unallocatedInfo.length > 0 || result.recommendations) && (
        <div className="grid grid-cols-1 gap-4">
          
          {/* Critical Errors (Red) */}
          {criticalWarnings.length > 0 && (
            <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 text-destructive dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
              <AlertTitle className="font-semibold mb-2">Configuration Issues</AlertTitle>
              <AlertDescription>
                 <ul className="list-disc list-inside space-y-1 text-sm opacity-90">
                  {criticalWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Informational / Unallocated (Grey/Blue) - Non-threatening */}
          {unallocatedInfo.length > 0 && (
             <Alert className="bg-muted/50 border-border text-muted-foreground">
              <Info className="h-5 w-5 text-muted-foreground" />
              <AlertTitle className="font-semibold mb-2">Capacity Status</AlertTitle>
              <AlertDescription>
                 <ul className="list-disc list-inside space-y-1 text-sm opacity-90">
                  {unallocatedInfo.map((w, i) => <li key={i}>{w} (Reserved for future top-level growth)</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Recommendations (Blue) */}
          {result.recommendations && result.recommendations.length > 0 && (
            <Alert className="bg-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-400">
              <Lightbulb className="h-5 w-5 text-blue-500" />
              <AlertTitle className="font-semibold mb-2">Optimization Tips</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1 text-sm opacity-90">
                  {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Region Visualizer */}
      <Card className="overflow-hidden border-border/50 bg-card/40 backdrop-blur-sm shadow-lg pt-2">
      <CardHeader className="bg-muted/20 m-4 p-4 rounded-xl">
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-2">
                 <PieChart className="w-4 h-4 text-muted-foreground" />
                 <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Regional Distribution</CardTitle>
             </div>
             <Badge variant="secondary" className="font-mono text-xs border-border">{result.hierarchy.cidr}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          
          {/* Percentage Bar with "Reserved" section styling */}
          <div className="space-y-3">
            <div className="flex h-8 w-full overflow-hidden rounded-md bg-muted/30 shadow-inner border border-border/50">
                {/* Active Regions */}
                {result.summary.regionBreakdown.map((r, i) => (
                    <div 
                        key={i}
                        className={cn("h-full transition-all hover:brightness-110 relative group cursor-help border-r border-background/20")}
                        style={{ 
                            width: `${r.percentage}%`, 
                            backgroundColor: `hsl(${220 + (i * 40)}, 85%, 55%)` 
                        }}
                        title={`${r.name}: ${r.percentage.toFixed(1)}%`}
                    />
                ))}
                
                {/* Unallocated / Reserved Space - Distinctive Styling */}
                {totalAllocationPercentage < 100 && (
                    <div 
                        className="h-full bg-muted/40 relative cursor-help"
                        style={{ 
                            width: `${100 - totalAllocationPercentage}%`,
                            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.05) 5px, rgba(0,0,0,0.05) 10px)"
                        }}
                        title={`Reserved / Unallocated: ${(100 - totalAllocationPercentage).toFixed(1)}%`}
                    >
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 select-none">
                                Unallocated
                            </span>
                        </div>
                    </div>
                )}
            </div>
             <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                <span>0% Address Space</span>
                <span>100%</span>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {result.summary.regionBreakdown.map((r, i) => {
                 const projectedSites = Math.ceil(sitesNeeded * (r.ratio / totalRatio));
                 const utilization = Math.min(100, (projectedSites / r.sitesCapacity) * 100);
                 const color = `hsl(${220 + (i * 40)}, 85%, 55%)`;
                 const isHighUtil = utilization > 90;

                 return (
                    <div key={i} className="relative overflow-hidden rounded-xl border bg-background/50 p-4 hover:bg-background hover:shadow-md transition-all group hover:border-primary/30">
                        <div className="absolute left-0 top-0 h-full w-1 transition-all group-hover:w-1.5" style={{ backgroundColor: color }} />
                        
                        <div className="flex justify-between items-start mb-5 pl-2">
                             <div>
                                <div className="font-semibold text-sm">{r.name}</div>
                                <div className="text-xs font-mono text-muted-foreground mt-0.5 bg-muted/50 px-1.5 py-0.5 rounded w-fit">{r.cidr}</div>
                             </div>
                             <Badge variant="outline" className="text-[10px] font-mono bg-background/50">
                                {r.percentage.toFixed(1)}%
                             </Badge>
                        </div>

                        <div className="pl-2 space-y-3">
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">
                                    <span>Utilization</span>
                                    <span className={isHighUtil ? "text-destructive" : "text-emerald-500"}>{utilization.toFixed(0)}%</span>
                                </div>
                                
                                {/* Custom Progress Bar implementation to avoid DOM errors */}
                                <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
                                    <div 
                                        className={cn("h-full w-full flex-1 transition-all", isHighUtil ? "bg-destructive" : "bg-emerald-500")} 
                                        style={{ transform: `translateX(-${100 - (utilization || 0)}%)` }} 
                                    />
                                </div>
                            </div>
                             <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t border-dashed">
                                <span>Proj. Sites: <span className="text-foreground font-medium">{projectedSites.toLocaleString()}</span></span>
                                <span className="font-mono text-[10px]">Max: {r.sitesCapacity.toLocaleString()}</span>
                             </div>
                        </div>
                    </div>
                 );
             })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, subtext, highlight, color }: any) {
    return (
        <Card className={cn("border-border/50 transition-all hover:-translate-y-1 hover:shadow-md bg-card/60", highlight && "bg-primary/5 border-primary/20")}>
            <CardContent className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">{label}</p>
                <div className={cn("text-3xl font-bold mb-1 tracking-tight", color)}>{value}</div>
                <p className="text-xs text-muted-foreground font-medium">{subtext}</p>
            </CardContent>
        </Card>
    )
}