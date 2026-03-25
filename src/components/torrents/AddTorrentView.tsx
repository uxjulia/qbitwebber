import { useState, useRef } from "react";
import { Upload, Link, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAddTorrent } from "@/hooks/useApi";
import { toast } from "@/hooks/use-toast";
import { TorrentPreviewDialog } from "@/components/search/TorrentPreviewDialog";
import type { TorrentPreviewInput } from "@/components/search/TorrentPreviewDialog";

export function AddTorrentView() {
  const [mode, setMode] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [savePath, setSavePath] = useState("");
  const [previewInput, setPreviewInput] = useState<TorrentPreviewInput | null>(
    null,
  );
  const [hasFile, setHasFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTorrent = useAddTorrent();

  const handleSubmitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    try {
      await addTorrent.mutateAsync({ url, category, savePath });
      toast.success("Torrent added successfully");
      setUrl("");
    } catch {
      toast.error("Failed to add torrent");
    }
  };

  const handleSubmitFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    try {
      await addTorrent.mutateAsync({ file, category, savePath });
      toast.success("Torrent added successfully");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        setHasFile(false);
      }
    } catch {
      toast.error("Failed to add torrent");
    }
  };

  const handlePreviewUrl = () => {
    if (!url) return;
    setPreviewInput({
      fileUrl: url,
      fileName: url,
      savePath: savePath || undefined,
      category: category || undefined,
    });
  };

  const handlePreviewFile = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setPreviewInput({
      file,
      fileName: file.name,
      savePath: savePath || undefined,
      category: category || undefined,
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add Torrent</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={mode === "url" ? "default" : "outline"}
              onClick={() => setMode("url")}
              className="flex-1"
            >
              <Link className="h-4 w-4 mr-2" />
              URL
            </Button>
            <Button
              variant={mode === "file" ? "default" : "outline"}
              onClick={() => setMode("file")}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              File
            </Button>
          </div>

          {mode === "url" ? (
            <form onSubmit={handleSubmitUrl} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">Torrent URL (magnet or http)</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="magnet:?xt=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  placeholder="e.g. movies"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="savePath">Save Path</Label>
                <Input
                  id="savePath"
                  placeholder="Leave empty for default"
                  value={savePath}
                  onChange={(e) => setSavePath(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handlePreviewUrl}
                  disabled={!url}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={addTorrent.isPending}
                >
                  {addTorrent.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmitFile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Torrent File</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".torrent"
                  ref={fileInputRef}
                  className="cursor-pointer"
                  onChange={(e) => setHasFile(!!e.target.files?.[0])}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category2">Category</Label>
                <Input
                  id="category2"
                  placeholder="e.g. movies"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="savePath2">Save Path</Label>
                <Input
                  id="savePath2"
                  placeholder="Leave empty for default"
                  value={savePath}
                  onChange={(e) => setSavePath(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handlePreviewFile}
                  disabled={!hasFile}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={addTorrent.isPending}
                >
                  {addTorrent.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <TorrentPreviewDialog
        input={previewInput}
        open={!!previewInput}
        onOpenChange={(open) => {
          if (!open) setPreviewInput(null);
        }}
      />
    </div>
  );
}
