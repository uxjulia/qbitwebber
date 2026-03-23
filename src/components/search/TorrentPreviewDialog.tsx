import { useState, useEffect, useRef } from 'react'
import { Loader2, Download, File, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { qbitClient } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import type { SearchResult, TorrentFile } from '@/types'

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function extractMagnetHash(url: string): string | null {
  const match = url.match(/urn:btih:([a-fA-F0-9]{40})/i)
  return match ? match[1].toLowerCase() : null
}

interface TreeNode {
  name: string
  path: string
  isFile: boolean
  size: number
  children: TreeNode[]
}

function buildTree(files: TorrentFile[]): TreeNode[] {
  const root: TreeNode[] = []
  files.forEach(file => {
    const parts = file.name.split('/')
    let current = root
    parts.forEach((part, idx) => {
      const isLast = idx === parts.length - 1
      const path = parts.slice(0, idx + 1).join('/')
      let node = current.find(n => n.name === part)
      if (!node) {
        node = { name: part, path, isFile: isLast, size: isLast ? file.size : 0, children: [] }
        current.push(node)
      }
      if (!isLast) current = node.children
    })
  })
  return root
}

function FileTreeNode({ node, depth }: { node: TreeNode; depth: number }) {
  const indent = depth * 16
  if (node.isFile) {
    return (
      <div className="flex items-center gap-2 py-1 px-2" style={{ paddingLeft: indent }}>
        <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm truncate flex-1">{node.name}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">{formatSize(node.size)}</span>
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center gap-2 py-1 px-2 font-medium text-sm" style={{ paddingLeft: indent }}>
        <FolderOpen className="h-4 w-4 text-yellow-500 flex-shrink-0" />
        <span className="truncate">{node.name}</span>
      </div>
      {node.children.map(child => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

const METADATA_STATES = new Set(['metaDL', 'forcedMetaDL'])

const DEMO_FILES: TorrentFile[] = [
  { index: 0, name: 'video.mp4', size: 5_000_000_000, progress: 0, priority: 1, is_seed: false, piece_range: [0, 5000] },
  { index: 1, name: 'subtitles/english.srt', size: 45_000, progress: 0, priority: 1, is_seed: false, piece_range: [5001, 5001] },
  { index: 2, name: 'subtitles/spanish.srt', size: 42_000, progress: 0, priority: 1, is_seed: false, piece_range: [5002, 5002] },
  { index: 3, name: 'extras/behind-the-scenes.mkv', size: 800_000_000, progress: 0, priority: 1, is_seed: false, piece_range: [5003, 5800] },
]

interface TorrentPreviewDialogProps {
  result: SearchResult | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TorrentPreviewDialog({ result, open, onOpenChange }: TorrentPreviewDialogProps) {
  const [status, setStatus] = useState<'idle' | 'adding' | 'polling' | 'ready' | 'error'>('idle')
  const [files, setFiles] = useState<TorrentFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const addedHashRef = useRef<string | null>(null)
  const downloadedRef = useRef(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!open || !result) return

    cancelledRef.current = false
    downloadedRef.current = false
    addedHashRef.current = null
    setStatus('adding')
    setFiles(null)
    setError(null)
    setIsDownloading(false)

    const run = async () => {
      try {
        // Demo mode: simulate metadata fetch with fake files
        if (import.meta.env.VITE_DEMO_MODE) {
          await new Promise(r => setTimeout(r, 800))
          if (cancelledRef.current) return
          setStatus('polling')
          await new Promise(r => setTimeout(r, 700))
          if (cancelledRef.current) return
          setFiles(DEMO_FILES)
          setStatus('ready')
          return
        }

        const existing = await qbitClient.getTorrents()
        if (cancelledRef.current) return

        const existingHashes = new Set(existing.map(t => t.hash))
        const magnetHash = extractMagnetHash(result.fileUrl)

        // If this torrent is already present (by magnet hash), just show its files
        if (magnetHash && existingHashes.has(magnetHash)) {
          addedHashRef.current = magnetHash
          downloadedRef.current = true // already exists, don't delete on close
          const fileList = await qbitClient.getTorrentFiles(magnetHash)
          if (!cancelledRef.current) {
            setFiles(fileList)
            setStatus('ready')
          }
          return
        }

        await qbitClient.addTorrentUrl(result.fileUrl, { paused: true })
        if (cancelledRef.current) return

        // Set hash immediately for magnet links so cleanup can delete the torrent
        // even if the user closes the dialog before polling completes.
        if (magnetHash) {
          addedHashRef.current = magnetHash
        }

        setStatus('polling')

        // Poll until the torrent appears and metadata is ready
        for (let i = 0; i < 30 && !cancelledRef.current; i++) {
          await new Promise(r => setTimeout(r, 1000))
          const torrents = await qbitClient.getTorrents()
          const found = magnetHash
            ? torrents.find(t => t.hash === magnetHash)
            : torrents.find(t => !existingHashes.has(t.hash))

          if (found && !METADATA_STATES.has(found.state)) {
            addedHashRef.current = found.hash
            const fileList = await qbitClient.getTorrentFiles(found.hash)
            if (!cancelledRef.current) {
              setFiles(fileList)
              setStatus('ready')
            }
            return
          }
        }

        if (!cancelledRef.current) {
          setError('Timed out waiting for torrent metadata')
          setStatus('error')
        }
      } catch (err) {
        if (!cancelledRef.current) {
          console.error(err)
          setError('Failed to load torrent contents')
          setStatus('error')
        }
      }
    }

    run()

    return () => { cancelledRef.current = true }
  }, [open, result])

  const cleanup = () => {
    cancelledRef.current = true
    if (addedHashRef.current && !downloadedRef.current) {
      qbitClient.deleteTorrents([addedHashRef.current], false).catch(() => {})
    }
  }

  const handleDownload = async () => {
    if (!addedHashRef.current) return
    setIsDownloading(true)
    try {
      await qbitClient.resumeTorrents([addedHashRef.current])
      downloadedRef.current = true
      toast.success('Torrent added to download queue')
      onOpenChange(false)
    } catch {
      toast.error('Failed to start download')
      setIsDownloading(false)
    }
  }

  const statusLabel = status === 'adding' ? 'Adding torrent...' : 'Fetching metadata...'

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) { cleanup(); onOpenChange(false) } }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{result?.fileName ?? 'Torrent Preview'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {(status === 'adding' || status === 'polling') && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">{statusLabel}</span>
            </div>
          )}
          {status === 'error' && (
            <div className="text-center py-8 text-destructive text-sm">{error}</div>
          )}
          {status === 'ready' && files && files.length > 0 && (
            <>
              <div className="px-4 py-2 border-b text-sm text-muted-foreground">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </div>
              {buildTree(files).map(node => (
                <FileTreeNode key={node.path} node={node} depth={0} />
              ))}
            </>
          )}
          {status === 'ready' && files?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No files found</div>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => { cleanup(); onOpenChange(false) }}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={status !== 'ready' || isDownloading}>
            {isDownloading
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Download className="h-4 w-4 mr-2" />
            }
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
