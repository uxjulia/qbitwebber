import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  Wifi,
  WifiOff,
  Shield,
  Users,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerState, useTorrents } from "@/hooks/useApi";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  return formatBytes(bytesPerSec) + "/s";
}

function StatRow({
  label,
  value,
  icon,
  valueClassName,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <span
        className={`text-sm font-medium tabular-nums ${valueClassName ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export function StatsView() {
  const { data: state, isLoading } = useServerState();
  const { data: torrents } = useTorrents();

  const torrentCounts = torrents
    ? {
        total: torrents.length,
        downloading: torrents.filter(
          (t) =>
            t.state === "downloading" ||
            t.state === "stalledDL" ||
            t.state === "forcedDL",
        ).length,
        seeding: torrents.filter(
          (t) =>
            t.state === "uploading" ||
            t.state === "stalledUP" ||
            t.state === "forcedUP",
        ).length,
        paused: torrents.filter(
          (t) => t.state === "pausedDL" || t.state === "pausedUP",
        ).length,
        completed: torrents.filter((t) => t.progress === 1).length,
      }
    : null;

  const connectionIcon = !state ? null : state.connection_status ===
    "connected" ? (
    <Wifi className="h-4 w-4 text-green-500" />
  ) : state.connection_status === "firewalled" ? (
    <Shield className="h-4 w-4 text-amber-500" />
  ) : (
    <WifiOff className="h-4 w-4 text-red-500" />
  );

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Loading stats...
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {/* All-time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Time</CardTitle>
        </CardHeader>
        <CardContent>
          <StatRow
            label="Downloaded"
            value={state ? formatBytes(state.alltime_dl) : "—"}
            icon={<ArrowDownToLine className="h-4 w-4" />}
          />
          <StatRow
            label="Uploaded"
            value={state ? formatBytes(state.alltime_ul) : "—"}
            icon={<ArrowUpFromLine className="h-4 w-4" />}
          />
          <StatRow
            label="Share ratio"
            value={state ? parseFloat(state.global_ratio).toFixed(3) : "—"}
            icon={<Scale className="h-4 w-4" />}
          />
        </CardContent>
      </Card>

      {/* This session */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">This Session</CardTitle>
        </CardHeader>
        <CardContent>
          <StatRow
            label="Downloaded"
            value={state ? formatBytes(state.dl_info_data) : "—"}
            icon={<ArrowDownToLine className="h-4 w-4" />}
          />
          <StatRow
            label="Uploaded"
            value={state ? formatBytes(state.up_info_data) : "—"}
            icon={<ArrowUpFromLine className="h-4 w-4" />}
          />
          <StatRow
            label="Download speed"
            value={state ? formatSpeed(state.dl_info_speed) : "—"}
          />
          <StatRow
            label="Upload speed"
            value={state ? formatSpeed(state.up_info_speed) : "—"}
          />
          <StatRow
            label="Wasted"
            value={state ? formatBytes(state.total_wasted_session) : "—"}
            icon={<Trash2 className="h-4 w-4" />}
          />
        </CardContent>
      </Card>

      {/* Network */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Network</CardTitle>
        </CardHeader>
        <CardContent>
          <StatRow
            label="Status"
            value={state?.connection_status ?? "—"}
            icon={connectionIcon}
            valueClassName={`[font-variant:small-caps] ${
              state?.connection_status === "connected"
                ? "text-green-500"
                : state?.connection_status === "firewalled"
                  ? "text-amber-500"
                  : state?.connection_status === "disconnected"
                    ? "text-red-500"
                    : ""
            }`}
          />
          <StatRow
            label="DHT nodes"
            value={state ? state.dht_nodes.toLocaleString() : "—"}
          />
          <StatRow
            label="Connected peers"
            value={state ? state.total_peer_connections.toLocaleString() : "—"}
            icon={<Users className="h-4 w-4" />}
          />
        </CardContent>
      </Card>

      {/* Torrents */}
      {torrentCounts && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Torrents</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow label="Total" value={torrentCounts.total.toString()} />
            <StatRow
              label="Downloading"
              value={torrentCounts.downloading.toString()}
            />
            <StatRow label="Seeding" value={torrentCounts.seeding.toString()} />
            <StatRow label="Paused" value={torrentCounts.paused.toString()} />
            <StatRow
              label="Completed"
              value={torrentCounts.completed.toString()}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
