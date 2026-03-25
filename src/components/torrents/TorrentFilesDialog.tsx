import { File, FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTorrentFiles } from "@/hooks/useApi";
import type { Torrent, TorrentFile } from "@/types";

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  size: number;
  progress: number;
  children: TreeNode[];
}

function buildTree(files: TorrentFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  files.forEach((file) => {
    const parts = file.name.split("/");
    let current = root;
    parts.forEach((part, idx) => {
      const isLast = idx === parts.length - 1;
      const path = parts.slice(0, idx + 1).join("/");
      let node = current.find((n) => n.name === part);
      if (!node) {
        node = {
          name: part,
          path,
          isFile: isLast,
          size: isLast ? file.size : 0,
          progress: isLast ? file.progress : 0,
          children: [],
        };
        current.push(node);
      }
      if (!isLast) current = node.children;
    });
  });
  return root;
}

function FileTreeNode({ node, depth }: { node: TreeNode; depth: number }) {
  const indent = depth * 16;
  if (node.isFile) {
    return (
      <div
        className="flex items-center gap-2 py-1 px-2"
        style={{ paddingLeft: indent }}
      >
        <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm truncate flex-1">{node.name}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {formatSize(node.size)}
        </span>
        {node.progress > 0 && node.progress < 1 && (
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {Math.round(node.progress * 100)}%
          </span>
        )}
      </div>
    );
  }
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 px-2 font-medium text-sm"
        style={{ paddingLeft: indent }}
      >
        <FolderOpen className="h-4 w-4 text-yellow-500 flex-shrink-0" />
        <span className="truncate">{node.name}</span>
      </div>
      {node.children.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

interface TorrentFilesDialogProps {
  torrent: Torrent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TorrentFilesDialog({
  torrent,
  open,
  onOpenChange,
}: TorrentFilesDialogProps) {
  const { data: files, isLoading } = useTorrentFiles(torrent?.hash ?? null);

  if (!torrent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">{torrent.name}</DialogTitle>
        </DialogHeader>

        <div className="px-4 py-2 border-b text-sm text-muted-foreground">
          {files?.length ?? 0} files
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading files...
            </div>
          ) : files && files.length > 0 ? (
            buildTree(files).map((node) => (
              <FileTreeNode key={node.path} node={node} depth={0} />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No files
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
