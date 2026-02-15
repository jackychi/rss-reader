import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Sidebar from '../components/Sidebar'

const mockFeeds = [
  {
    category: 'Tech',
    feeds: [
      { title: 'TechCrunch', xmlUrl: 'https://techcrunch.com/feed/' },
      { title: 'The Verge', xmlUrl: 'https://theverge.com/rss/index.xml' }
    ]
  },
  {
    category: 'News',
    feeds: [
      { title: 'BBC News', xmlUrl: 'https://feeds.bbci.co.uk/news/rss.xml' }
    ]
  }
]

const defaultProps = {
  feeds: mockFeeds,
  selectedFeed: null,
  expandedCategories: { Tech: true, News: false },
  onToggleCategory: vi.fn(),
  onSelectFeed: vi.fn(),
  onSelectAll: vi.fn(),
  searchQuery: '',
  onSearchChange: vi.fn(),
  unreadCounts: { Tech: 5, News: 3, 'Tech-https://techcrunch.com/feed/': 3, 'Tech-https://theverge.com/rss/index.xml': 2 }
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render all categories', () => {
    render(<Sidebar {...defaultProps} />)

    expect(screen.getByText('Tech')).toBeInTheDocument()
    expect(screen.getByText('News')).toBeInTheDocument()
  })

  it('should render feed items when category is expanded', () => {
    render(<Sidebar {...defaultProps} />)

    expect(screen.getByText('TechCrunch')).toBeInTheDocument()
    expect(screen.getByText('The Verge')).toBeInTheDocument()
  })

  it('should render search input', () => {
    render(<Sidebar {...defaultProps} />)

    const searchInput = screen.getByPlaceholderText('搜索订阅源...')
    expect(searchInput).toBeInTheDocument()
  })

  it('should render "全部文章" button', () => {
    render(<Sidebar {...defaultProps} />)

    expect(screen.getByText('全部文章')).toBeInTheDocument()
  })

  it('should call onSearchChange when search input changes', () => {
    render(<Sidebar {...defaultProps} />)

    const searchInput = screen.getByPlaceholderText('搜索订阅源...')
    fireEvent.change(searchInput, { target: { value: 'test' } })

    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('test')
  })

  it('should call onToggleCategory when category is clicked', () => {
    render(<Sidebar {...defaultProps} />)

    const newsCategory = screen.getByText('News')
    fireEvent.click(newsCategory)

    expect(defaultProps.onToggleCategory).toHaveBeenCalledWith('News')
  })

  it('should call onSelectFeed when feed is clicked', () => {
    render(<Sidebar {...defaultProps} />)

    const techCrunch = screen.getByText('TechCrunch')
    fireEvent.click(techCrunch)

    expect(defaultProps.onSelectFeed).toHaveBeenCalledWith(
      'Tech',
      { title: 'TechCrunch', xmlUrl: 'https://techcrunch.com/feed/' }
    )
  })

  it('should call onSelectAll when "全部文章" is clicked', () => {
    render(<Sidebar {...defaultProps} />)

    const allArticles = screen.getByText('全部文章')
    fireEvent.click(allArticles)

    expect(defaultProps.onSelectAll).toHaveBeenCalled()
  })

  it('should filter feeds based on search query', () => {
    const propsWithSearch = {
      ...defaultProps,
      searchQuery: 'Tech',
      expandedCategories: { Tech: true, News: true }
    }

    render(<Sidebar {...propsWithSearch} />)

    expect(screen.getByText('TechCrunch')).toBeInTheDocument()
    // BBC News should be filtered out
    expect(screen.queryByText('BBC News')).not.toBeInTheDocument()
  })

  it('should show total unread count', () => {
    render(<Sidebar {...defaultProps} />)

    // Total unread = 5 (Tech) + 3 (News) + 3 (TechCrunch) + 2 (The Verge) = 13
    expect(screen.getByText('13')).toBeInTheDocument()
  })

  it('should show category unread count when expanded', () => {
    render(<Sidebar {...defaultProps} />)

    expect(screen.getByText('5')).toBeInTheDocument() // Tech category unread
  })

  it('should render folder icons correctly', () => {
    render(<Sidebar {...defaultProps} />)

    // Tech is expanded, News is not
    // The component should render FolderOpen for expanded and Folder for collapsed
    // Check that folder icons exist by looking for svg elements
    const folderIcons = document.querySelectorAll('.lucide-folder, .lucide-folder-open')
    expect(folderIcons.length).toBeGreaterThan(0)
  })
})
