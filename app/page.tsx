"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ArrowLeft, ArrowRight, Network, Moon, Sun } from "lucide-react";
import { HierarchicalAllocator, type RegionBias, type AllocationResult } from "@/lib/hierarchical-allocator";
import { StepIndicator } from "@/components/step-indicator";
import { ConfigurationForm } from "@/components/configuration-form";
import { ResultsSummary } from "@/components/results-summary";
import { HierarchyView } from "@/components/hierarchy-view";
import { SiteExample } from "@/components/site-example";
import { useTheme } from "next-themes";

const REGION_THEMES = [
  { name: "Orion", code: "ORI" },
  { name: "Andromeda", code: "AND" },
  { name: "Cygnus", code: "CYG" },
  { name: "Lyra", code: "LYR" },
  { name: "Draco", code: "DRC" },
  { name: "Phoenix", code: "PHX" },
];

const STEPS = ["Configure", "Analysis", "Hierarchy"];

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1);
  
  // Configuration State
  const [supernet, setSupernet] = useState("10.0.0.0/8");
  const [regionCount, setRegionCount] = useState(4);
  const [subRegionsPerRegion, setSubRegionsPerRegion] = useState(2);
  const [sitesNeeded, setSitesNeeded] = useState(1000);
  const [vlansPerSite, setVlansPerSite] = useState(5);
  const [vlanSize, setVlanSize] = useState(24);
  const [regionRatios, setRegionRatios] = useState<number[]>([1, 1, 1, 1]);
  
  // Results State
  const [result, setResult] = useState<AllocationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vlanPrefixes, setVlanPrefixes] = useState<number[]>([]);

  // Theme (requires Next-Themes provider in layout.tsx)
  const { theme, setTheme } = useTheme();

  const updateRegionCount = (count: number) => {
    setRegionCount(count);
    setRegionRatios((prev) => {
      const newRatios = [...prev];
      if (count > prev.length) {
        return [...newRatios, ...Array(count - prev.length).fill(1)];
      }
      return newRatios.slice(0, count);
    });
  };

  const updateRegionRatio = (index: number, ratio: number) => {
    const newRatios = [...regionRatios];
    newRatios[index] = ratio;
    setRegionRatios(newRatios);
  };

  const updateVlanPrefix = (index: number, prefix: number) => {
    setVlanPrefixes((prev) => {
      const base = prev.length ? prev : Array.from({ length: vlansPerSite }, () => vlanSize);
      const next = [...base];
      next[index] = prefix;
      return next;
    });
  };

  const calculate = () => {
    try {
      setError(null);

      const regionBiases: RegionBias[] = Array.from({ length: regionCount }, (_, i) => ({
        name: REGION_THEMES[i]?.name || `Region ${i + 1}`,
        ratio: regionRatios[i] || 1,
        code: REGION_THEMES[i]?.code,
      }));

      const allocator = new HierarchicalAllocator({
        supernet,
        regionBiases,
        subRegionsPerRegion,
        vlansPerSite,
        vlanSize,
        totalSitesNeeded: sitesNeeded,
        growthMultiplier: 3,
      });

      const allocation = allocator.allocate();
      
      // Reset custom VLAN prefixes only if logic suggests a fresh start
      if (vlanPrefixes.length !== vlansPerSite) {
         const initialPrefixes = Array.from({ length: vlansPerSite }, () => vlanSize);
         setVlanPrefixes(initialPrefixes);
      }
      
      setResult(allocation);
      setCurrentStep(2);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
      setResult(null);
    }
  };

  return (
    <div className="min-h-screen bg-background transition-colors duration-300 selection:bg-primary/20 selection:text-primary">
      {/* Modern Background Mesh */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background">
        <div className="absolute top-0 z-[-2] h-screen w-screen bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
        <div className="absolute bottom-0 left-0 z-[-2] h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-10 max-w-6xl">
        {/* Header & Nav */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-primary to-purple-600 rounded-xl shadow-lg shadow-primary/25">
                <Network className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                IPAM <span className="text-primary">Architect</span>
              </h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
              Design intelligent, hierarchical IPv4 network blueprints for enterprise scale.
            </p>
          </div>
          
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-full bg-background/50 backdrop-blur-sm border-border/50"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>

        {/* Steps */}
        <div className="mb-10">
          <StepIndicator currentStep={currentStep} steps={STEPS} />
        </div>

        {/* Content Transition Area */}
        <div className="relative min-h-[400px]">
          {/* STEP 1: CONFIGURATION */}
          {currentStep === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
              <ConfigurationForm
                supernet={supernet}
                setSupernet={setSupernet}
                regionCount={regionCount}
                setRegionCount={updateRegionCount}
                subRegionsPerRegion={subRegionsPerRegion}
                setSubRegionsPerRegion={setSubRegionsPerRegion}
                sitesNeeded={sitesNeeded}
                setSitesNeeded={setSitesNeeded}
                vlansPerSite={vlansPerSite}
                setVlansPerSite={setVlansPerSite}
                vlanSize={vlanSize}
                setVlanSize={setVlanSize}
                regionRatios={regionRatios}
                updateRegionRatio={updateRegionRatio}
                regionThemes={REGION_THEMES}
              />

              {error && (
                <Alert variant="destructive" className="mt-6 animate-in zoom-in-95 border-destructive/50 bg-destructive/10">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Configuration Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end mt-8">
                <Button size="lg" onClick={calculate} className="gap-2 shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all">
                  Generate Blueprint
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: RESULTS */}
          {currentStep === 2 && result && (
             <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <ResultsSummary result={result} sitesNeeded={sitesNeeded} />

                <SiteExample
                  allocation={result}
                  vlanSize={vlanSize}
                  vlansPerSite={vlansPerSite}
                  vlanPrefixes={vlanPrefixes}
                  updateVlanPrefix={updateVlanPrefix}
                  regionThemes={REGION_THEMES}
                />

                <div className="flex justify-between pt-6 border-t border-border/50">
                  <Button variant="ghost" onClick={() => setCurrentStep(1)} className="gap-2 hover:bg-secondary">
                    <ArrowLeft className="w-4 h-4" />
                    Refine Configuration
                  </Button>
                  <Button onClick={() => setCurrentStep(3)} className="gap-2">
                    View Hierarchy
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
             </div>
          )}

          {/* STEP 3: HIERARCHY */}
          {currentStep === 3 && result && (
             <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <HierarchyView result={result} regionThemes={REGION_THEMES} />

                <div className="flex justify-between pt-6 border-t border-border/50">
                  <Button variant="outline" onClick={() => setCurrentStep(2)} className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Analysis
                  </Button>
                  <Button variant="ghost" onClick={() => setCurrentStep(1)} className="gap-2 text-muted-foreground hover:text-primary">
                    Start New Project
                  </Button>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}