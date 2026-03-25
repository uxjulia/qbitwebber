import { useState, useEffect, useRef } from 'react'
import { Loader2, Download, File, FolderOpen, CheckSquare, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { qbitClient } from '@/lib/api'
import { useCategories } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'
import type { TorrentFile } from '@/types'

export interface TorrentPreviewInput {
  fileUrl?: string
  file?: File
  fileName: string
  savePath?: string
  category?: string
}

// ---------------------------------------------------------------------------
// Bencode parser — extracts file list directly from a .torrent file
// ---------------------------------------------------------------------------

interface BencodeDict { [key: string]: BencodeValue }
type BencodeValue = number | Uint8Array | BencodeValue[] | BencodeDict

function decodeBencode(data: Uint8Array, pos = 0): [BencodeValue, number] {
  const ch = data[pos]
  if (ch === 105) { // 'i'
    let end = pos + 1
    while (data[end] !== 101) end++ // 'e'
    return [parseInt(new TextDecoder().decode(data.subarray(pos + 1, end)), 10), end + 1]
  }
  if (ch === 108) { // 'l'
    const list: BencodeValue[] = []
    pos++
    while (data[pos] !== 101) {
      const [val, next] = decodeBencode(data, pos)
      list.push(val)
      pos = next
    }
    return [list, pos + 1]
  }
  if (ch === 100) { // 'd'
    const dict: Record<string, BencodeValue> = {}
    pos++
    while (data[pos] !== 101) {
      const [keyBytes, keyEnd] = decodeBencode(data, pos)
      const key = new TextDecoder().decode(keyBytes as Uint8Array)
      const [val, valEnd] = decodeBencode(data, keyEnd)
      dict[key] = val
      pos = valEnd
    }
    return [dict, pos + 1]
  }
  // String: "<length>:<bytes>"
  let colon = pos
  while (data[colon] !== 58) colon++ // ':'
  const len = parseInt(new TextDecoder().decode(data.subarray(pos, colon)), 10)
  const start = colon + 1
  return [data.subarray(start, start + len), start + len]
}

function parseTorrentFile(data: Uint8Array): TorrentFile[] {
  const [torrent] = decodeBencode(data)
  const info = (torrent as Record<string, BencodeValue>)['info'] as Record<string, BencodeValue>
  if (!info) throw new Error('Invalid torrent: missing info dictionary')
  const dec = new TextDecoder('utf-8')
  const name = dec.decode(info['name'] as Uint8Array)
  if (Array.isArray(info['files'])) {
    return (info['files'] as Record<string, BencodeValue>[]).map((file, index) => ({
      index,
      name: [name, ...(file['path'] as Uint8Array[]).map(p => dec.decode(p))].join('/'),
      size: file['length'] as number,
      progress: 0,
      priority: 1,
      is_seed: false,
      piece_range: [0, 0] as [number, number],
    }))
  }
  return [{
    index: 0,
    name,
    size: info['length'] as number,
    progress: 0,
    priority: 1,
    is_seed: false,
    piece_range: [0, 0] as [number, number],
  }]
}

// ---------------------------------------------------------------------------

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
  index: number
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
        node = { name: part, path, isFile: isLast, size: isLast ? file.size : 0, index: isLast ? file.index : -1, children: [] }
        current.push(node)
      }
      if (!isLast) current = node.children
    })
  })
  return root
}

function FileTreeNode({
  node,
  depth,
  selectedIndices,
  onToggle,
}: {
  node: TreeNode
  depth: number
  selectedIndices: Set<number>
  onToggle: (index: number) => void
}) {
  const indent = depth * 16
  if (node.isFile) {
    const isSelected = selectedIndices.has(node.index)
    return (
      <div
        className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 cursor-pointer"
        style={{ paddingLeft: indent }}
        onClick={() => onToggle(node.index)}
      >
        {isSelected
          ? <CheckSquare className="h-4 w-4 text-green-500 flex-shrink-0" />
          : <Square className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
        <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm break-all flex-1">{node.name}</span>
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
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedIndices={selectedIndices} onToggle={onToggle} />
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

interface CategoryComboboxProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  disabled?: boolean
}

function CategoryCombobox({ value, onChange, options, disabled }: CategoryComboboxProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = options.filter(o => o.toLowerCase().includes(value.toLowerCase()))
  const showDropdown = open && filtered.length > 0

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="e.g. movies"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        autoComplete="off"
      />
      {showDropdown && (
        <ul className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md">
          {filtered.map(option => (
            <li
              key={option}
              className={cn(
                'px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground',
                option === value && 'bg-accent text-accent-foreground'
              )}
              onMouseDown={() => { onChange(option); setOpen(false) }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface TorrentPreviewDialogProps {
  input: TorrentPreviewInput | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TorrentPreviewDialog({ input, open, onOpenChange }: TorrentPreviewDialogProps) {
  const { data: categoriesData } = useCategories()
  const existingCategories = categoriesData ? Object.keys(categoriesData) : []
  const [status, setStatus] = useState<'idle' | 'parsing' | 'adding' | 'polling' | 'ready' | 'error'>('idle')
  const [files, setFiles] = useState<TorrentFile[] | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [savePath, setSavePath] = useState('')
  const [category, setCategory] = useState('')
  // Set when torrent has been added to qBittorrent (not set for client-side parsed .torrent files)
  const addedHashRef = useRef<string | null>(null)
  const downloadedRef = useRef(false)
  const cancelledRef = useRef(false)
  // True when file list was parsed locally — torrent has NOT been added to qBittorrent yet
  const parsedClientSideRef = useRef(false)

  useEffect(() => {
    if (!open || !input) return

    cancelledRef.current = false
    downloadedRef.current = false
    addedHashRef.current = null
    parsedClientSideRef.current = false

    const run = async () => {
      setStatus('parsing')
      setFiles(null)
      setSelectedIndices(new Set())
      setError(null)
      setIsDownloading(false)
      setSavePath(input.savePath ?? '')
      setCategory(input.category ?? '')

      try {
        if (import.meta.env.VITE_DEMO_MODE) {
          await new Promise(r => setTimeout(r, 800))
          if (cancelledRef.current) return
          setStatus('polling')
          await new Promise(r => setTimeout(r, 700))
          if (cancelledRef.current) return
          setFiles(DEMO_FILES)
          setSelectedIndices(new Set(DEMO_FILES.map(f => f.index)))
          setStatus('ready')
          return
        }

        // --- Fast path: parse .torrent file directly in the browser ---
        if (input.file) {
          const buf = await input.file.arrayBuffer()
          if (cancelledRef.current) return
          const fileList = parseTorrentFile(new Uint8Array(buf))
          parsedClientSideRef.current = true
          setFiles(fileList)
          setSelectedIndices(new Set(fileList.map(f => f.index)))
          setStatus('ready')
          return
        }

        // --- Slow path: magnet / HTTP URL — must ask qBittorrent for metadata ---
        setStatus('adding')

        const existing = await qbitClient.getTorrents()
        if (cancelledRef.current) return

        const existingHashes = new Set(existing.map(t => t.hash))
        const magnetHash = input.fileUrl ? extractMagnetHash(input.fileUrl) : null
        const options = { savePath: input.savePath, category: input.category }

        // If this magnet is already in qBittorrent, just show its files
        if (magnetHash && existingHashes.has(magnetHash)) {
          addedHashRef.current = magnetHash
          downloadedRef.current = true
          const fileList = await qbitClient.getTorrentFiles(magnetHash)
          if (!cancelledRef.current) {
            setFiles(fileList)
            setSelectedIndices(new Set(fileList.map(f => f.index)))
            setStatus('ready')
          }
          return
        }

        if (input.fileUrl) {
          await qbitClient.addTorrentUrl(input.fileUrl, options)
        }
        if (cancelledRef.current) return

        if (magnetHash) {
          addedHashRef.current = magnetHash
        }

        setStatus('polling')

        for (let i = 0; i < 30 && !cancelledRef.current; i++) {
          await new Promise(r => setTimeout(r, 1000))
          const torrents = await qbitClient.getTorrents()
          const found = magnetHash
            ? torrents.find(t => t.hash === magnetHash)
            : torrents.find(t => !existingHashes.has(t.hash))

          if (found && !METADATA_STATES.has(found.state)) {
            addedHashRef.current = found.hash
            await qbitClient.pauseTorrents([found.hash])
            const fileList = await qbitClient.getTorrentFiles(found.hash)
            if (!cancelledRef.current) {
              setFiles(fileList)
              setSelectedIndices(new Set(fileList.map(f => f.index)))
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
  }, [open, input])

  const cleanup = () => {
    cancelledRef.current = true
    // Only clean up if we actually added something to qBittorrent
    if (!parsedClientSideRef.current && addedHashRef.current && !downloadedRef.current) {
      qbitClient.deleteTorrents([addedHashRef.current], false).catch(() => {})
    }
  }

  const handleToggleFile = async (index: number) => {
    const isSelected = selectedIndices.has(index)
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (isSelected) next.delete(index)
      else next.add(index)
      return next
    })
    // For client-side parsed files, priorities are applied at download time
    if (parsedClientSideRef.current || !addedHashRef.current) return
    const newPriority = isSelected ? 0 : 1
    try {
      await qbitClient.setFilePriority(addedHashRef.current, String(index), newPriority)
    } catch {
      setSelectedIndices(prev => {
        const next = new Set(prev)
        if (isSelected) next.add(index)
        else next.delete(index)
        return next
      })
      toast.error('Failed to update file selection')
    }
  }

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      // Client-side parsed: torrent hasn't been added yet — add it now with priorities
      if (parsedClientSideRef.current && input?.file) {
        const existing = await qbitClient.getTorrents()
        const existingHashes = new Set(existing.map(t => t.hash))
        await qbitClient.addTorrentFile(input.file, {
          paused: true,
          savePath: savePath || undefined,
          category: category || undefined,
        })
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 500))
          const torrents = await qbitClient.getTorrents()
          const found = torrents.find(t => !existingHashes.has(t.hash))
          if (found) {
            addedHashRef.current = found.hash
            const deselected = files?.filter(f => !selectedIndices.has(f.index)) ?? []
            await Promise.all(deselected.map(f =>
              qbitClient.setFilePriority(found.hash, String(f.index), 0)
            ))
            await qbitClient.resumeTorrents([found.hash])
            downloadedRef.current = true
            toast.success('Torrent added to download queue')
            onOpenChange(false)
            return
          }
        }
        throw new Error('Timed out waiting for torrent to be added')
      }

      // Server-side path: torrent is already in qBittorrent, just resume it
      if (!addedHashRef.current) return
      const hashes = [addedHashRef.current]
      if (savePath.trim()) await qbitClient.setTorrentLocation(hashes, savePath.trim())
      if (category.trim()) await qbitClient.setTorrentCategory(hashes, category.trim())
      await qbitClient.resumeTorrents(hashes)
      downloadedRef.current = true
      toast.success('Torrent added to download queue')
      onOpenChange(false)
    } catch {
      toast.error('Failed to start download')
      setIsDownloading(false)
    }
  }

  const selectedSize = files?.filter(f => selectedIndices.has(f.index)).reduce((acc, f) => acc + f.size, 0) ?? 0
  const totalSize = files?.reduce((acc, f) => acc + f.size, 0) ?? 0

  const statusLabel =
    status === 'parsing' ? 'Reading torrent...' :
    status === 'adding' ? 'Adding torrent...' :
    'Fetching metadata...'

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) { cleanup(); onOpenChange(false) } }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{input?.fileName ?? 'Torrent Preview'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {(status === 'parsing' || status === 'adding' || status === 'polling') && (
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
              <div className="px-4 py-2 border-b text-sm text-muted-foreground flex justify-between">
                <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
                <span>Selected: {selectedIndices.size} ({formatSize(selectedSize)} / {formatSize(totalSize)})</span>
              </div>
              {buildTree(files).map(node => (
                <FileTreeNode key={node.path} node={node} depth={0} selectedIndices={selectedIndices} onToggle={handleToggleFile} />
              ))}
            </>
          )}
          {status === 'ready' && files?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No files found</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <CategoryCombobox
              value={category}
              onChange={setCategory}
              options={existingCategories}
              disabled={status !== 'ready'}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="preview-savepath" className="text-xs">Save Path</Label>
            <Input
              id="preview-savepath"
              placeholder="Default"
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              disabled={status !== 'ready'}
            />
          </div>
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
