"use client"

import { useState, useMemo, useEffect } from "react"
import { HierarchicalAllocator, type RegionBias, type AllocationResult } from "@/lib/hierarchical-allocator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Network, AlertTriangle, ChevronDown, Info, Lightbulb, ArrowRight } from "lucide-react"
import { CIDRMath } from "@/lib/cidr-math"
import type { CarouselApi } from "@/components/ui/carousel"

const REGION_THEMES = [
  { name: "Orion", code: "ORI" },
  { name: "Andromeda", code: "AND" },
  { name: "Cygnus", code: "CYG" },
  { name: "Lyra", code: "LYR" },
  { name: "Draco", code: "DRC" },
  { name: "Phoenix", code: "PHX" },
]

const PRESET_SUPERNETS = [
  { label: "10.0.0.0/8 (Class A)", value: "10.0.0.0/8" },
  { label: "172.16.0.0/12 (Class B)", value: "172.16.0.0/12" },
  { label: "192.168.0.0/16 (Class C)", value: "192.168.0.0/16" },
]

interface SiteExampleVlan {
  cidr: string
  network: string
  broadcast: string
  addressRange: string
  usableHosts: number
}

interface SiteExample {
  cidr: string
  network: string
  broadcast: string
  addressRange: string
  vlans: SiteExampleVlan[]
  warning?: string
}

function buildSiteExample(
  allocation: AllocationResult,
  defaultVlanPrefix: number,
  vlansPerSite: number,
  vlanPrefixes?: number[],
): SiteExample | null {
  const regions = allocation.hierarchy.children
  if (!regions || regions.length === 0) return null

  const region =
    regions.find((r) => r.name !== "Unallocated" && r.children && r.children.length > 0) ?? regions[0]
  const subRegion = region.children && region.children[0]
  if (!subRegion) return null

  const { ip: subRegionIp, prefix: subRegionPrefix } = CIDRMath.parseCIDR(subRegion.cidr)
  const sitePrefix = allocation.sitePrefixRecommendation
  const siteNetwork = CIDRMath.getNthSubnet(subRegionIp, subRegionPrefix, sitePrefix, BigInt(0))
  const siteBroadcast = CIDRMath.getBroadcastAddress(siteNetwork, sitePrefix)
  const { first: siteFirst, last: siteLast } = CIDRMath.getHostRange(siteNetwork, sitePrefix)

  const vlans: SiteExampleVlan[] = []
  const siteBaseNum = CIDRMath.ipToNumber(siteNetwork)
  const siteBroadcastNum = CIDRMath.ipToNumber(siteBroadcast)
  const prefixes =
    vlanPrefixes && vlanPrefixes.length > 0
      ? vlanPrefixes
      : Array.from({ length: vlansPerSite }, () => defaultVlanPrefix)

  let currentIpNum = siteBaseNum
  let allocatedVlans = 0

  for (let i = 0; i < vlansPerSite; i++) {
    const prefix = prefixes[i] ?? defaultVlanPrefix
    const vlanSizeBig = CIDRMath.subnetAddressCount(prefix)

    let vlanNetworkNum = currentIpNum
    const remainder = vlanNetworkNum % vlanSizeBig
    if (remainder !== BigInt(0)) {
      vlanNetworkNum = vlanNetworkNum - remainder + vlanSizeBig
    }

    if (vlanNetworkNum + vlanSizeBig - BigInt(1) > siteBroadcastNum) {
      break
    }

    const vlanNetwork = CIDRMath.numberToIp(vlanNetworkNum)
    const vlanBroadcast = CIDRMath.getBroadcastAddress(vlanNetwork, prefix)
    const { first, last } = CIDRMath.getHostRange(vlanNetwork, prefix)

    vlans.push({
      cidr: `${vlanNetwork}/${prefix}`,
      network: vlanNetwork,
      broadcast: vlanBroadcast,
      addressRange: `${first} - ${last}`,
      usableHosts: Number(CIDRMath.usableHosts(prefix)),
    })

    allocatedVlans++
    currentIpNum = vlanNetworkNum + vlanSizeBig
  }

  const totalSiteAddresses = CIDRMath.subnetAddressCount(sitePrefix)
  const usedAddresses = currentIpNum - siteBaseNum
  const remainingAddresses = totalSiteAddresses - usedAddresses

  let warning: string | undefined
  if (allocatedVlans < vlansPerSite) {
    warning = `With your per-VLAN sizes, only ${allocatedVlans} of ${vlansPerSite} VLANs fit in the /${sitePrefix} site block.`
  } else {
    const minVlanSize = prefixes.reduce<bigint>((min, p) => {
      const size = CIDRMath.subnetAddressCount(p)
      return min === BigInt(0) || size < min ? size : min
    }, BigInt(0))

    if (minVlanSize > BigInt(0) && remainingAddresses > BigInt(0) && remainingAddresses < minVlanSize * BigInt(2)) {
      warning = `Per-site VLAN layout is close to capacity; only ${CIDRMath.formatSize(remainingAddresses)} addresses remain in the site block.`
    }
  }

  return {
    cidr: `${siteNetwork}/${sitePrefix}`,
    network: siteNetwork,
    broadcast: siteBroadcast,
    addressRange: `${siteFirst} - ${siteLast}`,
    vlans,
    warning,
  }
}

export default function Home() {
  const [supernet, setSupernet] = useState("10.0.0.0/8")
  const [regionCount, setRegionCount] = useState(4)
  const [subRegionsPerRegion, setSubRegionsPerRegion] = useState(2)
  const [sitesNeeded, setSitesNeeded] = useState(1000)
  const [vlansPerSite, setVlansPerSite] = useState(5)
  const [vlanSize, setVlanSize] = useState(24)
  const [result, setResult] = useState<AllocationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [regionRatios, setRegionRatios] = useState<number[]>([1, 1, 1, 1])
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set())
  const [siteExample, setSiteExample] = useState<SiteExample | null>(null)
  const [vlanPrefixes, setVlanPrefixes] = useState<number[]>([])
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [activeSlide, setActiveSlide] = useState(0)

  const updateRegionCount = (count: number) => {
    setRegionCount(count)
    setRegionRatios(Array(count).fill(1))
  }

  const updateRegionRatio = (index: number, ratio: number) => {
    const newRatios = [...regionRatios]
    newRatios[index] = ratio
    setRegionRatios(newRatios)
  }

  const totalRatio = useMemo(() => regionRatios.reduce((sum, r) => sum + r, 0), [regionRatios])

  const calculate = () => {
    try {
      setError(null)

      const regionBiases: RegionBias[] = Array.from({ length: regionCount }, (_, i) => ({
        name: REGION_THEMES[i]?.name || `Region ${i + 1}`,
        ratio: regionRatios[i] || 1,
      }))

      const allocator = new HierarchicalAllocator({
        supernet,
        regionBiases,
        subRegionsPerRegion,
        vlansPerSite,
        vlanSize,
        totalSitesNeeded: sitesNeeded,
        growthMultiplier: 3,
      })

      const allocation = allocator.allocate()
      const initialPrefixes = Array.from({ length: vlansPerSite }, () => vlanSize)
      setVlanPrefixes(initialPrefixes)
      const example = buildSiteExample(allocation, vlanSize, vlansPerSite, initialPrefixes)
      setSiteExample(example)
      setResult(allocation)
    } catch (err: any) {
      setError(err.message)
      setResult(null)
    }
  }

  useEffect(() => {
    if (!result) return
    if (vlanPrefixes.length === 0) return
    const example = buildSiteExample(result, vlanSize, vlansPerSite, vlanPrefixes)
    setSiteExample(example)
  }, [result, vlanSize, vlansPerSite, vlanPrefixes])

  useEffect(() => {
    if (!carouselApi) return

    const handleSelect = () => {
      try {
        setActiveSlide(carouselApi.selectedScrollSnap())
      } catch {
        // ignore
      }
    }

    handleSelect()
    carouselApi.on("select", handleSelect)
  }, [carouselApi])

  const toggleRegion = (regionId: string) => {
    setExpandedRegions((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(regionId)) {
        newSet.delete(regionId)
      } else {
        newSet.add(regionId)
      }
      return newSet
    })
  }

  const getUtilizationColor = (percentage: number) => {
    if (percentage > 80) return "text-red-600 dark:text-red-500"
    if (percentage > 60) return "text-yellow-600 dark:text-yellow-500"
    return "text-green-600 dark:text-green-500"
  }

  const updateVlanPrefix = (index: number, prefix: number) => {
    setVlanPrefixes((prev) => {
      const base = prev.length ? prev : Array.from({ length: vlansPerSite }, () => vlanSize)
      const next = [...base]
      next[index] = prefix
      return next
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 md:py-12 space-y-6 max-w-7xl">
        <div className="space-y-2 pb-6 border-b border-border/60">
          <div className="flex items-center gap-3 justify-between">
            <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
              <Network className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-balance bg-gradient-to-r from-primary/80 to-primary/40 bg-clip-text text-transparent">
                Network Subnet Design Tool
              </h1>
              <p className="text-base text-muted-foreground mt-1.5">
                Design hierarchical IP address allocation for global deployments with intelligent capacity planning
              </p>
            </div>
          </div>
        </div>

        <Carousel setApi={setCarouselApi} className="w-full max-w-5xl mx-auto">
          <CarouselContent>
            <CarouselItem>
              <div className="space-y-8 lg:space-y-10">
                <Card className="border-border/60 shadow-lg bg-gradient-to-b from-background/80 to-muted/40 backdrop-blur">
                  <CardHeader className="border-b border-border/60 bg-muted/30">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold pt-6">
                      <Network className="w-5 h-5 text-muted-foreground" />
                      Network Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    <div className="space-y-3">
                      <Label className="text-base font-medium">Supernet Address</Label>
                      <div className="space-y-3">
                        <Input
                          value={supernet}
                          onChange={(e) => setSupernet(e.target.value)}
                          placeholder="10.0.0.0/8"
                          className="font-mono text-base"
                        />
                        {supernet && (
                          <p className="text-sm text-muted-foreground">
                            {(() => {
                              try {
                                const { prefix } = CIDRMath.parseCIDR(supernet)
                                const total = CIDRMath.subnetAddressCount(prefix)
                                return `${CIDRMath.formatSize(total)} total addresses`
                              } catch {
                                return "Invalid CIDR"
                              }
                            })()}
                          </p>
                        )}
                        <div className="pt-2">
                          <Label className="text-sm text-muted-foreground font-normal mb-2 block">Quick Presets</Label>
                          <div className="flex flex-wrap gap-2">
                            {PRESET_SUPERNETS.map((preset) => (
                              <Button
                                key={preset.value}
                                variant="outline"
                                size="sm"
                                onClick={() => setSupernet(preset.value)}
                                className="text-sm font-mono h-9"
                              >
                                {preset.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className="text-base font-medium">Number of Regions</Label>
                        <Input
                          type="number"
                          min={1}
                          max={6}
                          value={regionCount}
                          onChange={(e) => updateRegionCount(Number.parseInt(e.target.value) || 1)}
                        />
                        <p className="text-sm text-muted-foreground">Astronomy-themed regions (max 6)</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-base font-medium">Territories per Region</Label>
                        <Input
                          type="number"
                          min={1}
                          max={16}
                          value={subRegionsPerRegion}
                          onChange={(e) => setSubRegionsPerRegion(Number.parseInt(e.target.value) || 1)}
                        />
                        <p className="text-sm text-muted-foreground">Sub-divisions within each region</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-base font-medium">Total Sites Needed</Label>
                        <Input
                          type="number"
                          min={1}
                          max={100000}
                          value={sitesNeeded}
                          onChange={(e) => setSitesNeeded(Number.parseInt(e.target.value) || 1)}
                        />
                        <p className="text-sm text-muted-foreground">Expected number of physical sites</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-base font-medium">VLANs per Site</Label>
                        <Input
                          type="number"
                          min={1}
                          max={64}
                          value={vlansPerSite}
                          onChange={(e) => setVlansPerSite(Number.parseInt(e.target.value) || 1)}
                        />
                        <p className="text-sm text-muted-foreground">Network segments per physical location</p>
                      </div>
                    </div>

                    <div className="space-y-3 p-4 bg-muted/40 rounded-lg border border-border/60">
                      <div className="flex justify-between items-center">
                        <Label className="text-base font-medium">VLAN Subnet Size: /{vlanSize}</Label>
                        <Badge variant="secondary" className="text-sm font-mono">
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
                      <div className="flex justify-between text-sm text-muted-foreground font-mono">
                        <span>/20 (4K hosts)</span>
                        <span>/24 (254 hosts)</span>
                        <span>/28 (14 hosts)</span>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-border/60">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-base font-semibold">Regional Capacity Bias</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Allocate more addresses to regions with higher ratios
                          </p>
                        </div>
                        <Badge variant="outline" className="text-sm font-mono">
                          Total Ratio: {totalRatio}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Array.from({ length: regionCount }).map((_, i) => (
                          <div key={i} className="space-y-2.5 p-3.5 bg-card rounded-lg border border-border/60">
                            <div className="flex justify-between items-center">
                              <Label className="font-medium text-base">
                                {REGION_THEMES[i]?.name || `Region ${i + 1}`}
                              </Label>
                              <Badge variant="secondary" className="font-mono text-sm">
                                {regionRatios[i]}x ({((regionRatios[i] / totalRatio) * 100).toFixed(0)}%)
                              </Badge>
                            </div>
                            <Slider
                              value={[Math.log2(regionRatios[i])]}
                              onValueChange={([val]) => updateRegionRatio(i, Math.pow(2, val))}
                              min={0}
                              max={3}
                              step={1}
                              className="w-full"
                            />
                            <div className="flex justify-between text-sm font-mono text-muted-foreground">
                              <span>1x</span>
                              <span>2x</span>
                              <span>4x</span>
                              <span>8x</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="pt-2 lg:pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      calculate()
                      if (carouselApi) {
                        carouselApi.scrollTo(1)
                      }
                    }}
                    className="w-full font-medium py-6 text-base transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    Calculate & continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>

                {error && (
                  <Alert variant="destructive" className="border-destructive/50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="font-semibold">Configuration Error</AlertTitle>
                    <AlertDescription className="text-sm">{error}</AlertDescription>
                  </Alert>
                )}
              </div>
            </CarouselItem>

            <CarouselItem>
              {result ? (
                <div className="space-y-8 lg:space-y-10">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => carouselApi?.scrollTo(0)}
                      className="gap-2"
                    >
                      <ChevronDown className="w-4 h-4 rotate-90" />
                      Back to Configuration
                    </Button>
                    <Badge variant="secondary" className="text-sm">
                      Results for {supernet}
                    </Badge>
                  </div>
                  <section className="space-y-6 py-4">
                    {(result.warnings || result.recommendations) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {result.warnings && (
                          <Alert variant="destructive" className="border-destructive/50">
                            <AlertTriangle className="h-5 w-5" />
                            <AlertTitle className="font-semibold text-base">Warnings</AlertTitle>
                            <AlertDescription className="text-base">
                              <ul className="list-disc list-inside space-y-1 mt-2">
                                {result.warnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}

                        {result.recommendations && (
                          <Alert className="border-border/60 bg-muted/30">
                            <Lightbulb className="h-5 w-5 text-primary" />
                            <AlertTitle className="font-semibold text-base">Recommendations</AlertTitle>
                            <AlertDescription className="text-base">
                              <ul className="list-disc list-inside space-y-1 mt-2">
                                {result.recommendations.map((r, i) => (
                                  <li key={i}>{r}</li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                  </section>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="border-border/60 bg-card/90 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 transition-all duration-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                          Site Prefix
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="text-4xl font-semibold tracking-tight">/{result.sitePrefixRecommendation}</div>
                        <p className="text-sm text-muted-foreground mt-2">
                          {result.totalSubnetsPerSite} VLANs per site
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                          Total Sites
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="text-4xl font-semibold tracking-tight">
                          {result.totalSitesSupported.toLocaleString()}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">Across all regions</p>
                      </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                          Utilization
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div
                          className={`text-4xl font-semibold tracking-tight ${getUtilizationColor(result.utilizationPercentage)}`}
                        >
                          {result.utilizationPercentage.toFixed(1)}%
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          Based on {sitesNeeded.toLocaleString()} sites needed
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                          Regions
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="text-4xl font-semibold tracking-tight">{result.summary.totalRegions}</div>
                        <p className="text-sm text-muted-foreground mt-2">
                          {result.summary.totalSubRegions} territories
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <section className="space-y-4 py-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Card className="border-border/60 bg-card/90 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 transition-all duration-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                            Region And Site Codes
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(() => {
                            const theme = REGION_THEMES[0]
                            if (!theme) return null
                            const exampleSiteId = `${theme.code}-S001`
                            return (
                              <>
                                <p className="text-sm text-muted-foreground">
                                  Regions use astronomy names with shortcodes.
                                </p>
                                <p className="font-mono text-sm">
                                  {theme.name} — {theme.code}
                                </p>
                                <p className="font-mono text-sm">Example site ID: {exampleSiteId}</p>
                              </>
                            )
                          })()}

                          {siteExample && vlanPrefixes.length > 0 && (
                            <div className="pt-2 border-t border-border/60 space-y-3">
                              <h4 className="text-sm font-medium">Per-VLAN Size Bias (site template)</h4>
                              <p className="text-xs text-muted-foreground">
                                Adjust individual VLAN prefix lengths within the site block. Smaller prefix = larger VLAN.
                              </p>
                              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                {vlanPrefixes.map((prefix, index) => (
                                  <div key={index} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                      <span>VLAN {index + 1}</span>
                                      <span className="font-mono">
                                        /{prefix} · {CIDRMath.formatSize(CIDRMath.usableHosts(prefix))} hosts
                                      </span>
                                    </div>
                                    <Slider
                                      value={[prefix]}
                                      onValueChange={([val]) => updateVlanPrefix(index, val)}
                                      min={result.sitePrefixRecommendation}
                                      max={30}
                                      step={1}
                                      className="w-full"
                                    />
                                  </div>
                                ))}
                              </div>
                              {siteExample.warning && (
                                <p className="text-xs text-yellow-600">
                                  {siteExample.warning}
                                </p>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {siteExample && (
                        <Card className="border-border/60 bg-card/90 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 transition-all duration-200">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                              Site Template Example
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div>
                              <p className="font-mono text-sm">{siteExample.cidr}</p>
                              <p className="text-xs text-muted-foreground">{siteExample.addressRange}</p>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">VLANs</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {siteExample.vlans.map((vlan, index) => (
                                  <div
                                    key={vlan.cidr}
                                    className="p-3 bg-muted/30 rounded-md border border-border/60 space-y-1.5"
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs font-medium">VLAN {index + 1}</span>
                                      <Badge variant="outline" className="text-xs font-mono">
                                        {vlan.usableHosts} hosts
                                      </Badge>
                                    </div>
                                    <p className="font-mono text-xs text-muted-foreground">{vlan.cidr}</p>
                                    <p className="text-xs text-muted-foreground">{vlan.addressRange}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </section>

                  <Card className="border-border/60 shadow-sm py-0">
                    <Tabs defaultValue="breakdown" className="w-full">
                      <CardHeader className="border-b border-border/60 bg-muted/30 pb-0 pt-6">
                        <TabsList className="grid w-full grid-cols-2 h-10 p-0">
                          <TabsTrigger value="breakdown" className="text-base font-medium">
                            Regional Breakdown
                          </TabsTrigger>
                          <TabsTrigger value="hierarchy" className="text-base font-medium">
                            Full Hierarchy
                          </TabsTrigger>
                        </TabsList>
                      </CardHeader>

                      <CardContent className="pt-6">
                        <TabsContent value="breakdown" className="space-y-4 mt-0">
                          <div className="overflow-x-auto rounded-lg border border-border/60">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-border/60 bg-muted/40">
                                  <th className="text-left p-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                    Region
                                  </th>
                                  <th className="text-left p-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                    CIDR
                                  </th>
                                  <th className="text-right p-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                    Ratio
                                  </th>
                                  <th className="text-right p-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                    Sites
                                  </th>
                                  <th className="text-right p-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                    % of Total
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {result.summary.regionBreakdown.map((r, idx) => (
                                  <tr
                                    key={r.name}
                                    className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
                                  >
                                    <td className="p-3">
                                      <Badge variant="outline" className="text-sm font-medium">
                                        {r.name}
                                      </Badge>
                                    </td>
                                    <td className="p-3 font-mono text-base">{r.cidr}</td>
                                    <td className="text-right p-3 font-medium text-base">{r.ratio}x</td>
                                    <td className="text-right p-3 font-mono text-base">
                                      {r.sitesCapacity.toLocaleString()}
                                    </td>
                                    <td className="text-right p-3">
                                      <Badge variant="secondary" className="font-mono text-sm">
                                        {r.percentage.toFixed(1)}%
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </TabsContent>

                        <TabsContent value="hierarchy" className="space-y-3 mt-0">
                          {result.hierarchy.children
                            ?.filter((r) => r.name !== "Unallocated")
                            .map((region) => (
                              <Collapsible
                                key={region.id}
                                open={expandedRegions.has(region.id)}
                                onOpenChange={() => toggleRegion(region.id)}
                              >
                                <Card className="overflow-hidden border-border/60 shadow-sm py-0">
                                  <CollapsibleTrigger asChild>
                                    <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors p-6">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <ChevronDown
                                            className={`w-4 h-4 text-muted-foreground transition-transform ${
                                              expandedRegions.has(region.id) ? "rotate-180" : ""
                                            }`}
                                          />
                                          <div>
                                            <CardTitle className="text-base font-semibold">{region.name}</CardTitle>
                                            <p className="text-xs text-muted-foreground font-mono mt-1">
                                              {region.cidr}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex gap-2">
                                          <Badge variant="outline" className="text-xs">
                                            {region.metadata?.ratio}x ratio
                                          </Badge>
                                          <Badge variant="secondary" className="text-xs font-mono">
                                            {CIDRMath.formatSize(region.totalAddresses)} addresses
                                          </Badge>
                                        </div>
                                      </div>
                                    </CardHeader>
                                  </CollapsibleTrigger>

                                  <CollapsibleContent>
                                    <CardContent className="pt-0 pb-4 px-4 space-y-4">
                                      <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-border/60">
                                        <div>
                                          <span className="text-muted-foreground">Network:</span>
                                          <span className="font-mono ml-2">{region.network}</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Broadcast:</span>
                                          <span className="font-mono ml-2">{region.broadcast}</span>
                                        </div>
                                      </div>

                                      <div className="pt-3 border-t border-border/60">
                                        <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                                          <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                          Territories
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                          {region.children?.map((subRegion) => (
                                            <div
                                              key={subRegion.id}
                                              className="p-3 bg-muted/30 rounded-md border border-border/60 space-y-1.5"
                                            >
                                              <div className="flex justify-between items-start">
                                                <h5 className="font-medium text-sm">{subRegion.name}</h5>
                                                <Badge variant="outline" className="text-xs">
                                                  {subRegion.metadata?.sitesCapacity} sites
                                                </Badge>
                                              </div>
                                              <p className="font-mono text-xs text-muted-foreground">
                                                {subRegion.cidr}
                                              </p>
                                              <p className="text-xs text-muted-foreground">{subRegion.addressRange}</p>
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
                </div>
              ) : (
                <Card className="border-border/60 shadow-sm">
                  <CardContent className="py-12 text-center">
                    <Network className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">No Results Yet</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Configure your network parameters and click Calculate to see results
                    </p>
                    <Button variant="outline" onClick={() => carouselApi?.scrollTo(0)}>
                      Go to Configuration
                    </Button>
                  </CardContent>
                </Card>
              )}
            </CarouselItem>
          </CarouselContent>

          {activeSlide > 0 && (
            <div className="flex justify-center gap-2 mt-6">
              <CarouselPrevious className="static translate-y-0" />
              <CarouselNext className="static translate-y-0" />
            </div>
          )}
        </Carousel>
      </div>
    </div>
  )
}
