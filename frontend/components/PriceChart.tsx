"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Address } from "viem";
import { usePriceHistory } from "@/hooks/usePriceHistory";

type Props = {
  curveAddress: Address | undefined;
};

/**
 * Price chart for a single token's execution price history.
 * Strategist Minimal theme: warm paper bg, near-black line, accent crosshair.
 *
 * Data source: usePriceHistory (built on useTradeHistory).
 */
export function PriceChart({ curveAddress }: Props) {
  const { points, isLoading } = usePriceHistory(curveAddress);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // === Init chart once ===
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: {
          type: ColorType.Solid,
          color: "#FAFAF7",
        },
        textColor: "#6B6B6B",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: {
          color: "#EBEBE3",
          style: LineStyle.Dotted,
        },
        horzLines: {
          color: "#EBEBE3",
          style: LineStyle.Dotted,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#C2410C",
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: "#C2410C",
        },
        horzLine: {
          color: "#C2410C",
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: "#C2410C",
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#E5E5DD",
        ticksVisible: false,
      },
      rightPriceScale: {
        borderColor: "#E5E5DD",
        ticksVisible: false,
        scaleMargins: {
          top: 0.15,
          bottom: 0.1,
        },
      },
      handleScroll: false,
      handleScale: false,
      autoSize: true,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#0A0A0A",
      lineWidth: 2,
      topColor: "rgba(194, 65, 12, 0.18)",
      bottomColor: "rgba(194, 65, 12, 0.0)",
      priceLineVisible: true,
      priceLineColor: "#C2410C",
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: "#C2410C",
      crosshairMarkerBackgroundColor: "#FAFAF7",
      priceFormat: {
        type: "price",
        precision: 8,
        minMove: 0.00000001,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Resize observer — keep chart responsive to container width.
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // === Push data when points change ===
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    if (points.length === 0) {
      seriesRef.current.setData([]);
      return;
    }

    // lightweight-charts requires strictly ascending, unique time values.
    const byTime = new Map<number, number>();
    for (const p of points) {
      const t = Math.floor(p.time);
      // For dup timestamps (sub-second trades), keep the last (latest) price.
      byTime.set(t, p.price);
    }

    const data = Array.from(byTime.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({
        time: time as UTCTimestamp,
        value,
      }));

    seriesRef.current.setData(data);
    chartRef.current.timeScale().fitContent();
  }, [points]);

  // === Render ===

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <div className="type-kicker">Price · execution</div>
          <div className="text-[11px] text-ink-faint font-mono mt-1">
            USDC per token · last 24h
          </div>
        </div>
        {isLoading && (
          <div className="text-[11px] text-ink-mute font-mono">
            loading…
          </div>
        )}
      </div>

      {/* Chart container — always rendered so the chart instance can live */}
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: 320 }}
      />

      {/* Empty overlay */}
      {!isLoading && points.length === 0 && (
        <div className="border-t border-line px-5 py-6 text-center bg-paper-soft">
          <p className="text-ink-mute text-sm">
            No trades yet. The chart will appear once someone buys or sells.
          </p>
        </div>
      )}
    </div>
  );
}
