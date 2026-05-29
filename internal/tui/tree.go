package tui

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/teleman-cli/teleman/internal/chunker"
	"github.com/teleman-cli/teleman/internal/core"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
)

const (
	statusNone = iota
	statusDownloading
	statusComplete
	statusError
)

type node struct {
	name        string
	isDir       bool
	size        int64
	virtualPath string
	children    map[string]*node
	entry       *models.FileEntry // keep entry for chunks

	downloadStatus int
	downloaded     int64
	errMsg         string

	// Precomputed for fast list loading
	totalFiles int
	totalSize  int64
	
	isSelected bool
}

type treeItem struct {
	n *node
}

func (i treeItem) Title() string {
	title := ""
	if i.n.isDir {
		title = "📁 " + i.n.name
	} else {
		icon := "📄 "
		if i.n.downloadStatus == statusComplete {
			icon = "✓ "
		}
		title = icon + i.n.name
	}

	if i.n.isSelected {
		return lipgloss.NewStyle().Background(lipgloss.Color("238")).Foreground(lipgloss.Color("212")).Render(title)
	}
	return title
}

func (i treeItem) Description() string {
	if i.n.isDir {
		return fmt.Sprintf("%d files | %s", i.n.totalFiles, formatBytes(i.n.totalSize))
	}

	if i.n.downloadStatus == statusDownloading {
		pct := int64(0)
		if i.n.size > 0 {
			pct = (i.n.downloaded * 100) / i.n.size
		}
		return fmt.Sprintf("↓ %d%% | %s / %s", pct, formatBytes(i.n.downloaded), formatBytes(i.n.size))
	} else if i.n.downloadStatus == statusError {
		return fmt.Sprintf("✗ Error: %s", i.n.errMsg)
	}

	return formatBytes(i.n.size)
}

func (i treeItem) FilterValue() string {
	return i.n.name
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

type TreeModel struct {
	alias     string
	targetKey string
	cfg       *models.Config
	client    *telegram.Client

	root    *node
	current *node

	listModel list.Model
	width     int
	height    int

	history       []*node // Track directory navigation history for 'back'
	isDownloading  bool    // enforces single download concurrency
	activeDownload *node   // tracks the currently downloading file
	cancelDownload context.CancelFunc // allows cancellation of active download
	progressChan   chan tea.Msg
	downloadQueue  []*node

	confirmingMultiDelete []*node
	isDeleting            bool
	
	dotDotNode    *node   // Stable identity for the '..' navigation node
}

func NewTreeModel(alias, targetKey string, files map[string]*models.FileEntry, cfg *models.Config) *TreeModel {
	root := &node{
		name:     "/",
		isDir:    true,
		children: make(map[string]*node),
	}

	// Build tree
	for vPath, entry := range files {
		insertPath(root, vPath, entry)
	}

	// Compute directory sizes
	computeStats(root)

	l := list.New(nil, list.NewDefaultDelegate(), 0, 0)
	l.Title = fmt.Sprintf("Remote: %s (Root)", alias)
	l.Styles.Title = titleStyle
	l.SetShowStatusBar(true)

	// Add custom keybindings hint
	l.AdditionalFullHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(key.WithKeys("d"), key.WithHelp("d", "download")),
			key.NewBinding(key.WithKeys("x"), key.WithHelp("x", "cancel download")),
			key.NewBinding(key.WithKeys(" "), key.WithHelp("space", "select")),
			key.NewBinding(key.WithKeys("delete"), key.WithHelp("del", "delete")),
			key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "refresh index")),
			key.NewBinding(key.WithKeys("esc"), key.WithHelp("esc", "back")),
		}
	}
	l.AdditionalShortHelpKeys = l.AdditionalFullHelpKeys

	m := &TreeModel{
		alias:        alias,
		targetKey:    targetKey,
		cfg:          cfg,
		root:         root,
		current:      root,
		listModel:    l,
		progressChan: make(chan tea.Msg, 100),
		dotDotNode:   &node{name: "..", isDir: true},
	}

	m.updateList()
	return m
}

func insertPath(root *node, path string, entry *models.FileEntry) {
	parts := strings.Split(path, "/")
	current := root
	for i, part := range parts {
		if part == "" {
			continue
		}
		isDir := i < len(parts)-1
		if _, exists := current.children[part]; !exists {
			vPath := strings.Join(parts[:i+1], "/")
			current.children[part] = &node{
				name:        part,
				isDir:       isDir,
				virtualPath: vPath,
				children:    make(map[string]*node),
			}
		}
		if !isDir {
			current.children[part].size = entry.Size
			current.children[part].entry = entry
		}
		current = current.children[part]
	}
}

func computeStats(n *node) (int, int64) {
	if !n.isDir {
		return 1, n.size
	}
	var tFiles int
	var tSize int64
	for _, child := range n.children {
		f, s := computeStats(child)
		tFiles += f
		tSize += s
	}
	n.totalFiles = tFiles
	n.totalSize = tSize
	return tFiles, tSize
}

func (m *TreeModel) reconcileTree(oldNode, newNode *node) {
	newNode.downloadStatus = oldNode.downloadStatus
	newNode.downloaded = oldNode.downloaded
	newNode.errMsg = oldNode.errMsg
	newNode.isSelected = oldNode.isSelected

	if m.activeDownload == oldNode {
		m.activeDownload = newNode
	}

	if oldNode.isDir && newNode.isDir {
		for name, oldChild := range oldNode.children {
			if newChild, exists := newNode.children[name]; exists {
				m.reconcileTree(oldChild, newChild)
			}
		}
	}
}

func (m *TreeModel) updateList() {
	var items []list.Item

	var dirs []*node
	var files []*node

	for _, child := range m.current.children {
		if child.isDir {
			dirs = append(dirs, child)
		} else {
			files = append(files, child)
		}
	}

	// Sort alphabetical
	sort.Slice(dirs, func(i, j int) bool { return strings.ToLower(dirs[i].name) < strings.ToLower(dirs[j].name) })
	sort.Slice(files, func(i, j int) bool { return strings.ToLower(files[i].name) < strings.ToLower(files[j].name) })

	// Add ".." if not root
	if len(m.history) > 0 {
		items = append(items, treeItem{n: m.dotDotNode})
	}

	for _, d := range dirs {
		items = append(items, treeItem{n: d})
	}
	for _, f := range files {
		items = append(items, treeItem{n: f})
	}

	m.listModel.SetItems(items)

	pathDisplay := m.current.virtualPath
	if pathDisplay == "" {
		pathDisplay = "/"
	}
	
	suffix := ""
	if m.isDownloading {
		suffix = " [Downloading...]"
	}
	m.listModel.Title = fmt.Sprintf("Remote: %s (%s)%s", m.alias, pathDisplay, suffix)
}

func (m *TreeModel) SetSize(width, height int) {
	m.width = width
	m.height = height
	m.listModel.SetSize(width, height-1) // Reserve 1 line for global footer
}

type deleteFinishedMsg struct {
	err error
}

func (m *TreeModel) getSelectedNodes(n *node, results *[]*node) {
	if n.isSelected {
		*results = append(*results, n)
	}
	if n.isDir {
		for _, child := range n.children {
			m.getSelectedNodes(child, results)
		}
	}
}

func (m *TreeModel) runDelete(nodes []*node) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()
		var targetsRaw []string
		for _, n := range nodes {
			targetsRaw = append(targetsRaw, fmt.Sprintf("%s:%s", m.alias, n.virtualPath))
		}
		
		opts := &core.DeleteOptions{
			Confirm:   true,
			Recursive: true, // We can just set recursive true for directories in batch
			Transfers: 4,
			DryRun:    false,
		}
		err := core.RunDelete(ctx, targetsRaw, opts)
		return deleteFinishedMsg{err: err}
	}
}

type progressMsg struct {
	n       *node
	written int64
}

type downloadCompleteMsg struct {
	n *node
}

type downloadErrorMsg struct {
	n   *node
	err error
}

type indexRefreshMsg struct {
	err  error
	root *node
}

func listenProgress(c chan tea.Msg) tea.Cmd {
	return func() tea.Msg {
		return <-c
	}
}

func (m *TreeModel) Update(msg tea.Msg) (TreeModel, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case indexRefreshMsg:
		if msg.err != nil {
			m.listModel.NewStatusMessage(errorStyle.Render("Refresh failed: " + msg.err.Error()))
		} else {
			m.reconcileTree(m.root, msg.root)
			m.root = msg.root
			
			// Reconstruct history to preserve location
			newHistory := []*node{}
			curr := m.root
			valid := true
			
			if m.current.name != "/" {
				for _, h := range m.history {
					if h.name == "/" {
						newHistory = append(newHistory, m.root)
						continue
					}
					if next, ok := curr.children[h.name]; ok && next.isDir {
						newHistory = append(newHistory, next)
						curr = next
					} else {
						valid = false
						break
					}
				}
				
				if valid {
					if next, ok := curr.children[m.current.name]; ok && next.isDir {
						m.history = newHistory
						m.current = next
					} else {
						m.history = nil
						m.current = m.root
					}
				} else {
					m.history = nil
					m.current = m.root
				}
			} else {
				m.current = m.root
			}
			
			m.updateList()
			m.listModel.NewStatusMessage("Index refreshed successfully.")
		}
		return *m, nil

	case progressMsg:
		msg.n.downloaded = msg.written
		// Do not call updateList() here to prevent intense UI flickering.
		// Bubble Tea automatically re-renders the current items on any message.
		return *m, listenProgress(m.progressChan)

	case downloadCompleteMsg:
		msg.n.downloadStatus = statusComplete
		msg.n.downloaded = msg.n.size
		m.isDownloading = false
		m.activeDownload = nil
		m.cancelDownload = nil
		m.updateList()
		
		var nextCmd tea.Cmd
		if len(m.downloadQueue) > 0 {
			next := m.downloadQueue[0]
			m.downloadQueue = m.downloadQueue[1:]
			nextCmd = m.download(next)
		}
		return *m, nextCmd

	case downloadErrorMsg:
		if msg.err != context.Canceled {
			msg.n.downloadStatus = statusError
			msg.n.errMsg = msg.err.Error()
		} else {
			msg.n.downloadStatus = statusNone
			msg.n.downloaded = 0
		}
		m.isDownloading = false
		m.activeDownload = nil
		m.cancelDownload = nil
		m.updateList()
		
		var nextCmd tea.Cmd
		if len(m.downloadQueue) > 0 {
			next := m.downloadQueue[0]
			m.downloadQueue = m.downloadQueue[1:]
			nextCmd = m.download(next)
		}
		return *m, nextCmd

	case deleteFinishedMsg:
		m.isDeleting = false
		m.confirmingMultiDelete = nil
		if msg.err != nil {
			m.listModel.NewStatusMessage(errorStyle.Render(fmt.Sprintf("Delete failed: %v", msg.err)))
			return *m, nil
		}
		
		// Clear selection after delete
		var clearSelection func(*node)
		clearSelection = func(n *node) {
			n.isSelected = false
			if n.isDir {
				for _, child := range n.children {
					clearSelection(child)
				}
			}
		}
		clearSelection(m.root)
		
		m.listModel.NewStatusMessage("Deleted successfully. Refreshing index...")
		return *m, m.refreshIndex()

	case tea.KeyMsg:
		if m.confirmingMultiDelete != nil {
			if m.isDeleting {
				return *m, nil // ignore input while deleting
			}
			switch msg.String() {
			case "y", "Y":
				m.isDeleting = true
				return *m, m.runDelete(m.confirmingMultiDelete)
			case "n", "N", "esc", "q":
				m.confirmingMultiDelete = nil
				return *m, nil
			}
			return *m, nil // ignore other keys during prompt
		}

		if m.listModel.FilterState() == list.Filtering {
			break
		}

		switch msg.String() {
		case "esc", "left", "h", "backspace":
			if len(m.history) > 0 {
				m.current = m.history[len(m.history)-1]
				m.history = m.history[:len(m.history)-1]
				m.updateList()
				return *m, nil
			}
			// If history empty, allow event to propagate (MainModel will intercept to go back to remotes)

		case "enter", "right", "l":
			selected := m.listModel.SelectedItem()
			if selected != nil {
				i := selected.(treeItem)
				if i.n.name == ".." {
					// Go back
					if len(m.history) > 0 {
						m.current = m.history[len(m.history)-1]
						m.history = m.history[:len(m.history)-1]
						m.updateList()
					}
				} else if i.n.isDir {
					// Go into directory
					m.history = append(m.history, m.current)
					m.current = i.n
					m.updateList()
					m.listModel.ResetSelected()
				}
			}

		case " ":
			selected := m.listModel.SelectedItem()
			if selected != nil {
				i := selected.(treeItem)
				if i.n.name != ".." {
					i.n.isSelected = !i.n.isSelected
					m.updateList()
				}
			}
			return *m, nil

		case "d":
			var selectedNodes []*node
			m.getSelectedNodes(m.root, &selectedNodes)
			
			// If nothing selected globally, fall back to cursor item
			if len(selectedNodes) == 0 {
				cursorItem := m.listModel.SelectedItem()
				if cursorItem != nil {
					i := cursorItem.(treeItem)
					if i.n.name != ".." {
						selectedNodes = append(selectedNodes, i.n)
					}
				}
			}
			
			var newDownloads int
			for _, n := range selectedNodes {
				if n.isDir || n.downloadStatus == statusComplete || n == m.activeDownload {
					continue
				}
				
				alreadyQueued := false
				for _, qn := range m.downloadQueue {
					if qn == n {
						alreadyQueued = true
						break
					}
				}
				
				if !alreadyQueued {
					m.downloadQueue = append(m.downloadQueue, n)
					newDownloads++
				}
			}
			
			if newDownloads > 0 {
				m.listModel.NewStatusMessage(fmt.Sprintf("Queued %d items for download.", newDownloads))
				
				// Clear selection
				var clearSelection func(*node)
				clearSelection = func(n *node) {
					n.isSelected = false
					if n.isDir {
						for _, child := range n.children {
							clearSelection(child)
						}
					}
				}
				clearSelection(m.root)
				m.updateList()
				
				// If not currently downloading, trigger the first one
				if !m.isDownloading {
					next := m.downloadQueue[0]
					m.downloadQueue = m.downloadQueue[1:]
					return *m, m.download(next)
				}
			} else {
				m.listModel.NewStatusMessage(errorStyle.Render("No valid files to download."))
			}
			return *m, nil

		case "x":
			if m.isDownloading && m.cancelDownload != nil {
				m.cancelDownload()
				m.listModel.NewStatusMessage(errorStyle.Render("Download cancelled."))
			}
			return *m, nil

		case "delete":
			var selectedNodes []*node
			m.getSelectedNodes(m.root, &selectedNodes)
			
			if len(selectedNodes) == 0 {
				cursorItem := m.listModel.SelectedItem()
				if cursorItem != nil {
					i := cursorItem.(treeItem)
					if i.n.name != ".." {
						selectedNodes = append(selectedNodes, i.n)
					}
				}
			}
			
			if len(selectedNodes) > 0 {
				m.confirmingMultiDelete = selectedNodes
			}
			return *m, nil

		case "r":
			m.listModel.NewStatusMessage("Refreshing index from Telegram...")
			return *m, m.refreshIndex()
		}
	}

	var cmd tea.Cmd
	m.listModel, cmd = m.listModel.Update(msg)
	if cmd != nil {
		cmds = append(cmds, cmd)
	}
	return *m, tea.Batch(cmds...)
}

func (m *TreeModel) initClient() error {
	if m.client != nil {
		return nil
	}
	if m.cfg == nil {
		return fmt.Errorf("no config loaded")
	}
	if m.cfg.ActiveToken == "" {
		return fmt.Errorf("no active token")
	}
	m.client = telegram.NewSmartClient(m.cfg.ActiveToken, m.cfg.APIHosts, m.cfg.FileServerHosts)
	return nil
}

func (m *TreeModel) refreshIndex() tea.Cmd {
	return func() tea.Msg {
		if err := m.initClient(); err != nil {
			return indexRefreshMsg{err: err}
		}
		
		mgr, err := index.NewManager(m.client, m.cfg.IndexChannelID)
		if err != nil {
			return indexRefreshMsg{err: err}
		}
		
		idx, err := mgr.Load()
		if err != nil {
			return indexRefreshMsg{err: err}
		}
		
		newRoot := &node{
			name:     "/",
			isDir:    true,
			children: make(map[string]*node),
		}
		
		if targetFiles, ok := idx.Targets[m.targetKey]; ok {
			for vPath, entry := range targetFiles {
				insertPath(newRoot, vPath, entry)
			}
		}
		
		computeStats(newRoot)
		return indexRefreshMsg{root: newRoot}
	}
}

type chanWriter struct {
	c chan tea.Msg
	n *node
	w int64
}

func (w *chanWriter) Write(p []byte) (int, error) {
	w.w += int64(len(p))
	// Non-blocking send
	select {
	case w.c <- progressMsg{n: w.n, written: w.w}:
	default:
	}
	return len(p), nil
}

func (m *TreeModel) download(n *node) tea.Cmd {
	if err := m.initClient(); err != nil {
		m.listModel.NewStatusMessage(errorStyle.Render("Init client failed: " + err.Error()))
		return nil
	}

	m.isDownloading = true
	m.activeDownload = n
	n.downloadStatus = statusDownloading
	n.downloaded = 0
	n.errMsg = ""
	
	// Update title without rebuilding entire list
	pathDisplay := m.current.virtualPath
	if pathDisplay == "" {
		pathDisplay = "/"
	}
	m.listModel.Title = fmt.Sprintf("Remote: %s (%s)", m.alias, pathDisplay)
	m.updateList()

	// get password if needed (from env)
	var password []byte
	pwdStr := os.Getenv("TELEMAN_PASSWORD")
	if pwdStr != "" {
		password = []byte(pwdStr)
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.cancelDownload = cancel

	go func() {
		engine := chunker.NewEngine(m.client, false)
		
		// Preserve relative directory structure natively
		destPath := filepath.Join(".", filepath.FromSlash(n.virtualPath))
		
		// Ensure parent directories exist
		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			m.progressChan <- downloadErrorMsg{n: n, err: err}
			return
		}

		cw := &chanWriter{
			c: m.progressChan,
			n: n,
		}

		err := core.DownloadFile(ctx, engine, n.entry, destPath+".partial", password, cw)
		if err != nil {
			// If cancelled, cleanup partial file
			if err == context.Canceled {
				os.Remove(destPath + ".partial")
			}
			m.progressChan <- downloadErrorMsg{n: n, err: err}
			return
		}
		
		err = os.Rename(destPath+".partial", destPath)
		if err != nil {
			m.progressChan <- downloadErrorMsg{n: n, err: err}
			return
		}
		
		m.progressChan <- downloadCompleteMsg{n: n}
	}()

	return listenProgress(m.progressChan)
}

func (m *TreeModel) View() string {
	if m.confirmingMultiDelete != nil {
		status := "(y/n)"
		if m.isDeleting {
			status = "Deleting... please wait."
		}
		
		var targetName string
		if len(m.confirmingMultiDelete) == 1 {
			targetName = fmt.Sprintf("'%s'", m.confirmingMultiDelete[0].name)
		} else {
			targetName = fmt.Sprintf("%d items", len(m.confirmingMultiDelete))
		}
		
		promptText := fmt.Sprintf("⚠️ Are you sure you want to permanently delete?\n\n%s\n\n%s", targetName, status)
		
		dialogBox := lipgloss.NewStyle().
			Border(lipgloss.DoubleBorder()).
			BorderForeground(lipgloss.Color("196")).
			Background(lipgloss.Color("235")).
			Padding(1, 4).
			Align(lipgloss.Center).
			Render(promptText)
			
		return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, dialogBox)
	}

	view := m.listModel.View()

	var footer string
	if m.isDownloading && m.activeDownload != nil {
		pct := int64(0)
		if m.activeDownload.size > 0 {
			pct = (m.activeDownload.downloaded * 100) / m.activeDownload.size
		}
		
		queueText := ""
		if len(m.downloadQueue) > 0 {
			queueText = fmt.Sprintf(" (+%d queued)", len(m.downloadQueue))
		}
		
		statusText := fmt.Sprintf("Downloading %s: %d%%%s", m.activeDownload.name, pct, queueText)
		footer = lipgloss.NewStyle().
			Width(m.width).
			Align(lipgloss.Right).
			Foreground(lipgloss.Color("205")).
			Render(statusText)
	} else {
		footer = lipgloss.NewStyle().Width(m.width).Render("") // Empty padding line
	}

	return lipgloss.JoinVertical(lipgloss.Left, view, footer)
}
