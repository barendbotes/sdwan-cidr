import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Network, Globe, Layers, Building, Settings2, CheckCircle2, Plus, Minus, AlertCircle } from "lucide-react";
import { CIDRMath } from "@/lib/cidr-math";
import { cn } from "@/lib/utils";

interface NumberControlProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
}

function NumberControl({ value, onChange, min = 0, max = 100, step = 1, className, disabled }: NumberControlProps) {
  const handleDecrease = () => {
    if (!disabled && value > min) onChange(Math.max(min, value - step));
  };

  const handleIncrease = () => {
    if (!disabled && value < max) onChange(Math.min(max, value + step));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    if (!isNaN(newValue)) onChange(newValue);
  };

  return (
    <div className={cn("flex items-center border rounded-lg bg-background/50 h-11 w-full overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all hover:border-primary/30", className)}>
      <div className="h-full">
        <Button
          variant="ghost"
          size="icon"
          className="h-full w-10 rounded-none hover:bg-primary/10 hover:text-primary border-r"
          onClick={handleDecrease}
          disabled={disabled || value <= min}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input
        type="number"
        value={value}
        onChange={handleChange}
        className="border-0 shadow-none rounded-none focus-visible:ring-0 text-center h-full flex-1 min-w-0 bg-transparent font-mono font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min={min}
        max={max}
        disabled={disabled}
      />
      <div className="h-full">
        <Button
          variant="ghost"
          size="icon"
          className="h-full w-10 rounded-none hover:bg-primary/10 hover:text-primary border-l"
          onClick={handleIncrease}
          disabled={disabled || value >= max}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface ConfigurationFormProps {
  supernet: string;
  setSupernet: (value: string) => void;
  regionCount: number;
  setRegionCount: (value: number) => void;
  subRegionsPerRegion: number;
  setSubRegionsPerRegion: (value: number) => void;
  sitesNeeded: number;
  setSitesNeeded: (value: number) => void;
  vlansPerSite: number;
  setVlansPerSite: (value: number) => void;
  vlanSize: number;
  setVlanSize: (value: number) => void;
  regionRatios: number[];
  updateRegionRatio: (index: number, ratio: number) => void;
  regionThemes: { name: string; code: string }[];
}

const PRESET_SUPERNETS = [
  { label: "10.0.0.0/8", value: "10.0.0.0/8", desc: "Large Private" },
  { label: "172.16.0.0/12", value: "172.16.0.0/12", desc: "Medium Private" },
  { label: "192.168.0.0/16", value: "192.168.0.0/16", desc: "Small Private" },
];

export function ConfigurationForm(props: ConfigurationFormProps) {
  const totalRatio = props.regionRatios.reduce((sum, r) => sum + r, 0);

  // Validate Supernet on render for visual feedback
  let supernetInfo = { valid: false, size: "", error: false };
  try {
      const { prefix } = CIDRMath.parseCIDR(props.supernet);
      const total = CIDRMath.subnetAddressCount(prefix);
      supernetInfo = { valid: true, size: CIDRMath.formatSize(total), error: false };
  } catch {
      supernetInfo = { valid: false, size: "", error: props.supernet.length > 0 };
  }

  return (
    <Card className="border-border/60 shadow-xl bg-card/40 backdrop-blur-xl pt-2">
      <CardHeader className="bg-muted/20 m-4 p-2 rounded-xl">
        <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            <CardTitle className="text-xl">Network Parameters</CardTitle>
        </div>
        <CardDescription>Define the constraints for your automated allocation strategy.</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-10 pt-8 px-6">
        
        {/* Section 1: Supernet */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-4 space-y-2">
             <Label className="text-base font-semibold">Supernet Scope</Label>
             <p className="text-sm text-muted-foreground leading-relaxed">
               The root CIDR block to be carved up. Usually your entire private IP allocation (RFC1918).
             </p>
          </div>
          <div className="md:col-span-8 space-y-4">
                <div className="relative group">
                  <Input
                    id="supernet"
                    value={props.supernet}
                    onChange={(e) => props.setSupernet(e.target.value)}
                    placeholder="e.g. 10.0.0.0/8"
                    className={cn(
                        "font-mono text-lg h-14 pl-4 pr-12 transition-all border-2 bg-background/50",
                        supernetInfo.error ? "border-destructive/50 focus-visible:ring-destructive/20" : "focus-visible:ring-primary/20",
                        supernetInfo.valid && "border-emerald-500/30 focus-visible:border-emerald-500/50"
                    )}
                  />
                   {supernetInfo.valid && <CheckCircle2 className="absolute right-4 top-4.5 w-5 h-5 text-emerald-500 animate-in zoom-in" />}
                   {supernetInfo.error && <AlertCircle className="absolute right-4 top-4.5 w-5 h-5 text-destructive animate-in zoom-in" />}
                </div>
                
                <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div className="flex gap-2 flex-wrap">
                        {PRESET_SUPERNETS.map((preset) => (
                        <TooltipProvider key={preset.value}>
                            <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => props.setSupernet(preset.value)}
                                        className={cn(
                                            "h-8 text-xs font-mono border border-transparent transition-colors", 
                                            props.supernet === preset.value ? "border-primary bg-primary/10" : "hover:bg-background"
                                        )}
                                    >
                                        {preset.label}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>{preset.desc}</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        ))}
                    </div>
                    {supernetInfo.valid && (
                        <Badge variant="outline" className="font-mono text-xs bg-emerald-500/5 text-emerald-600 border-emerald-500/20">
                            {supernetInfo.size} addresses
                        </Badge>
                    )}
                </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />

        {/* Section 2: Topology */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
           <div className="md:col-span-4 space-y-2">
             <Label className="text-base font-semibold">Hierarchy & Scale</Label>
             <p className="text-sm text-muted-foreground leading-relaxed">
               Configure the physical topology.
             </p>
          </div>
          
          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <TopologyCard icon={Globe} color="text-blue-500" bg="bg-blue-500/10" label="Regions" subtext="Top-level areas">
                 <NumberControl value={props.regionCount} onChange={props.setRegionCount} min={1} max={6} />
            </TopologyCard>

            <TopologyCard icon={Layers} color="text-indigo-500" bg="bg-indigo-500/10" label="Territories" subtext="Sub-areas per region">
                <NumberControl value={props.subRegionsPerRegion} onChange={props.setSubRegionsPerRegion} min={1} max={16} />
            </TopologyCard>

             <TopologyCard icon={Building} color="text-emerald-500" bg="bg-emerald-500/10" label="Total Sites" subtext="Physical locations needed">
                <NumberControl value={props.sitesNeeded} onChange={props.setSitesNeeded} min={1} max={100000} step={10} />
            </TopologyCard>

             <TopologyCard icon={Settings2} color="text-orange-500" bg="bg-orange-500/10" label="VLANs per Site" subtext="Segments per location">
                <NumberControl value={props.vlansPerSite} onChange={props.setVlansPerSite} min={1} max={64} />
            </TopologyCard>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />

        {/* Section 3: Addressing */}
         <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
           <div className="md:col-span-4 space-y-2">
             <Label className="text-base font-semibold">Standardization</Label>
             <p className="text-sm text-muted-foreground leading-relaxed">
               The default size for standard VLANs (End User subnets).
             </p>
          </div>
          
          <div className="md:col-span-8">
             <div className="p-6 bg-secondary/30 rounded-xl border border-border/50 space-y-6 shadow-sm">
                 <div className="flex justify-between items-center">
                    <div className="space-y-1">
                        <Label className="font-medium">VLAN Subnet Size</Label>
                        <p className="text-xs text-muted-foreground">CIDR Prefix Length</p>
                    </div>
                    <Badge className="text-sm font-mono px-3 py-1 bg-background text-foreground border shadow-sm">
                        /{props.vlanSize}
                    </Badge>
                 </div>
                 
                 <div className="px-2">
                    <Slider
                        value={[props.vlanSize]}
                        onValueChange={([val]) => props.setVlanSize(val)}
                        min={20} max={28} step={1}
                        className="w-full cursor-pointer"
                    />
                 </div>

                <div className="grid grid-cols-3 text-center text-xs text-muted-foreground font-mono pt-2">
                    <div className="text-left">/20<br/>4094 hosts</div>
                    <div>/24<br/>254 hosts</div>
                    <div className="text-right">/28<br/>14 hosts</div>
                </div>
             </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />

        {/* Section 4: Weighting */}
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <Label className="text-base font-semibold">Regional Weighting</Label>
                    <p className="text-sm text-muted-foreground">
                        Allocate extra address space to high-growth regions.
                    </p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: props.regionCount }).map((_, i) => (
              <div key={i} className="group p-4 bg-card/50 rounded-xl border hover:border-primary/30 hover:bg-card transition-all duration-300">
                <div className="flex justify-between items-center mb-4">
                  <Label className="font-medium text-sm truncate pr-2 flex items-center gap-2">
                    <span className={cn(
                        "w-2 h-2 rounded-full", 
                        props.regionRatios[i] > 1 ? "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" : "bg-muted-foreground/30"
                    )}></span>
                    {props.regionThemes[i]?.name || `Region ${i + 1}`}
                  </Label>
                  <Badge variant="outline" className="font-mono text-xs bg-background">
                      {props.regionRatios[i]}x
                  </Badge>
                </div>
                <Slider
                  value={[Math.log2(props.regionRatios[i])]}
                  onValueChange={([val]) => props.updateRegionRatio(i, Math.pow(2, val))}
                  min={0} max={3} step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-3 font-medium uppercase tracking-wider">
                    <span>Std</span>
                    <span>Large</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

// Helper component for the topology grid
function TopologyCard({ icon: Icon, color, bg, label, subtext, children }: any) {
    return (
        <div className="space-y-3 p-5 rounded-xl border bg-card/40 hover:bg-card/80 transition-colors shadow-sm">
            <div className="flex items-center gap-3 mb-1">
                <div className={cn("p-2.5 rounded-lg", bg)}>
                    <Icon className={cn("w-4 h-4", color)} />
                </div>
                <div className="space-y-0.5">
                    <Label className="font-semibold block text-sm">{label}</Label>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">{subtext}</span>
                </div>
            </div>
            {children}
        </div>
    )
}