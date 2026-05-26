import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  ChevronRight,
  Description as DescriptionIcon,
  ExpandMore,
  FilterList,
  Folder,
  FolderOpen,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TemplateCatalogEntry } from '@lis/shared';
import { useLanguage } from '../hooks/useLanguage';
import { configApi } from '../api';
import TemplateEditorPanel from '../components/config/TemplateEditorPanel';
import CreateTemplateDialog from '../components/config/CreateTemplateDialog';
import ConfigLayout from '../components/layout/ConfigLayout';

// ─── Tree data structures ────────────────────────────────────────────────────

interface TreeFolder {
  type: 'folder';
  name: string;
  fullPath: string;
  children: TreeNode[];
}
interface TreeLeaf {
  type: 'leaf';
  name: string;
  entry: TemplateCatalogEntry;
}
type TreeNode = TreeFolder | TreeLeaf;

function buildTree(entries: TemplateCatalogEntry[]): TreeNode[] {
  const root: TreeFolder = { type: 'folder', name: '', fullPath: '', children: [] };
  for (const entry of entries) {
    const parts = entry.templateKey.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const folderPath = parts.slice(0, i + 1).join('/');
      let child = node.children.find(
        (c): c is TreeFolder => c.type === 'folder' && c.name === part,
      );
      if (!child) {
        child = { type: 'folder', name: part, fullPath: folderPath, children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({ type: 'leaf', name: parts[parts.length - 1]!, entry });
  }
  return root.children;
}

function getTopLevelExpanded(nodes: TreeNode[]): Set<string> {
  const expanded = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'folder') expanded.add(node.fullPath);
  }
  return expanded;
}

function allFolderPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'folder') {
      paths.push(node.fullPath);
      paths.push(...allFolderPaths(node.children));
    }
  }
  return paths;
}

// ─── Tree node renderer ──────────────────────────────────────────────────────

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  selectedTemplateKey: string | null;
  onSelectTemplate: (key: string) => void;
}

function TreeNodeRow({
  node,
  depth,
  expandedFolders,
  onToggleFolder,
  selectedTemplateKey,
  onSelectTemplate,
}: TreeNodeRowProps) {
  const indentPx = depth * 16;

  if (node.type === 'leaf') {
    const { entry } = node;
    return (
      <ListItemButton
        selected={entry.templateKey === selectedTemplateKey}
        onClick={() => onSelectTemplate(entry.templateKey)}
        sx={{ py: 0.5, pl: `${indentPx + 52}px`, pr: 1 }}
        dense
      >
        <ListItemIcon sx={{ minWidth: 18, mr: 0.75 }}>
          <DescriptionIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
        </ListItemIcon>
        <ListItemText
          primary={
            <Box display="flex" alignItems="center" gap={0.5}>
              <Typography
                variant="body2"
                noWrap
                sx={{ maxWidth: 130, fontSize: 12 }}
                title={entry.title}
              >
                {entry.title}
              </Typography>
              <Chip
                label={entry.kind}
                size="small"
                color={entry.kind === 'gross' ? 'default' : 'primary'}
                variant="outlined"
                sx={{ height: 14, fontSize: 9, flexShrink: 0 }}
              />
            </Box>
          }
          secondary={
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 10, fontFamily: 'monospace' }}
              noWrap
              title={node.name}
            >
              {node.name}
            </Typography>
          }
        />
      </ListItemButton>
    );
  }

  // Folder node
  const isExpanded = expandedFolders.has(node.fullPath);
  return (
    <>
      <ListItemButton
        onClick={() => onToggleFolder(node.fullPath)}
        sx={{ py: 0.5, pl: `${indentPx + 8}px`, pr: 1 }}
        dense
      >
        <ListItemIcon sx={{ minWidth: 18, mr: 0.25 }}>
          {isExpanded ? (
            <ExpandMore sx={{ fontSize: 16, color: 'text.disabled' }} />
          ) : (
            <ChevronRight sx={{ fontSize: 16, color: 'text.disabled' }} />
          )}
        </ListItemIcon>
        <ListItemIcon sx={{ minWidth: 20, mr: 0.75 }}>
          {isExpanded ? (
            <FolderOpen sx={{ fontSize: 16, color: 'warning.main' }} />
          ) : (
            <Folder sx={{ fontSize: 16, color: 'warning.main' }} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 500 }}>
              {node.name}/
            </Typography>
          }
        />
      </ListItemButton>
      <Collapse in={isExpanded} unmountOnExit>
        {node.children.map((child) => (
          <TreeNodeRow
            key={child.type === 'folder' ? child.fullPath : child.entry.templateKey}
            node={child}
            depth={depth + 1}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
            selectedTemplateKey={selectedTemplateKey}
            onSelectTemplate={onSelectTemplate}
          />
        ))}
      </Collapse>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 300;

export default function ConfigTemplatesPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const params = useParams<{ '*': string }>();
  const selectedTemplateKey = params['*'] && params['*'].length > 0 ? params['*'] : null;

  const [filter, setFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: catalog = [], isLoading, error } = useQuery({
    queryKey: ['config-templates'],
    queryFn: () => configApi.listTemplates(),
  });

  const filteredCatalog = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (e) =>
        e.templateKey.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.family.toLowerCase().includes(q),
    );
  }, [catalog, filter]);

  const tree = useMemo(() => buildTree(filteredCatalog), [filteredCatalog]);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() =>
    getTopLevelExpanded(buildTree(catalog)),
  );

  // When a filter is active, auto-expand everything so matches are visible
  const effectiveExpanded = useMemo(() => {
    if (!filter) return expandedFolders;
    return new Set(allFolderPaths(tree));
  }, [filter, tree, expandedFolders]);

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectedEntry = useMemo(
    () => (selectedTemplateKey ? catalog.find((e) => e.templateKey === selectedTemplateKey) : null),
    [catalog, selectedTemplateKey],
  );

  const handleSelectTemplate = (templateKey: string) => {
    navigate(`/config/templates/${templateKey}`);
  };

  const handleCreated = (templateKey: string) => {
    void queryClient.invalidateQueries({ queryKey: ['config-templates'] });
    handleSelectTemplate(templateKey);
    // Auto-expand ancestor folders of the new template
    const parts = templateKey.split('/');
    if (parts.length > 1) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        for (let i = 1; i < parts.length; i++) {
          next.add(parts.slice(0, i).join('/'));
        }
        return next;
      });
    }
  };

  return (
    <ConfigLayout>
    <Box display="flex" height="100%" overflow="hidden">
      {/* Sidebar */}
      <Box
        width={SIDEBAR_WIDTH}
        flexShrink={0}
        display="flex"
        flexDirection="column"
        borderRight={1}
        borderColor="divider"
        overflow="hidden"
      >
        <Box p={1.5} borderBottom={1} borderColor="divider">
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle2" fontWeight={600}>
              {t('cfg_title')}
            </Typography>
            <Tooltip title={t('cfg_new')}>
              <Button
                size="small"
                variant="contained"
                startIcon={<Add />}
                onClick={() => setCreateOpen(true)}
              >
                {t('cfg_new')}
              </Button>
            </Tooltip>
          </Box>
          <TextField
            size="small"
            fullWidth
            placeholder={t('cfg_filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <FilterList fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <Box flex={1} overflow="auto">
          {isLoading && (
            <Box display="flex" justifyContent="center" pt={4}>
              <CircularProgress size={28} />
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ m: 1 }}>
              {t('errorGeneric')}
            </Alert>
          )}
          {!isLoading && !error && tree.length === 0 && (
            <Typography variant="body2" color="text.secondary" p={2}>
              {t('cfg_noTemplates')}
            </Typography>
          )}
          {!isLoading && !error && tree.length > 0 && (
            <List dense disablePadding>
              {tree.map((node) => (
                <TreeNodeRow
                  key={node.type === 'folder' ? node.fullPath : node.entry.templateKey}
                  node={node}
                  depth={0}
                  expandedFolders={effectiveExpanded}
                  onToggleFolder={handleToggleFolder}
                  selectedTemplateKey={selectedTemplateKey}
                  onSelectTemplate={handleSelectTemplate}
                />
              ))}
            </List>
          )}
        </Box>
      </Box>

      {/* Main editor area */}
      <Box flex={1} minWidth={0} overflow="hidden" display="flex" flexDirection="column">
        {selectedEntry ? (
          <TemplateEditorPanel entry={selectedEntry} />
        ) : (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            flex={1}
            color="text.secondary"
            gap={1}
          >
            <DescriptionIcon sx={{ fontSize: 48, opacity: 0.3 }} />
            <Typography variant="body1">{t('cfg_selectTemplate')}</Typography>
          </Box>
        )}
      </Box>

      <CreateTemplateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        catalog={catalog}
        onCreated={handleCreated}
      />
    </Box>
    </ConfigLayout>
  );
}
