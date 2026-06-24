import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Sun, Moon, Copy, Check, X } from 'lucide-react';
import { marked } from 'marked';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-clojure';

interface Author {
  login: string;
  avatar_url?: string;
  "avatar-url"?: string;
}

interface ToVar {
  ns: string;
  name: string;
}

interface SeeAlso {
  to_var?: ToVar;
  "to-var"?: ToVar;
  _id: string;
}

interface Example {
  body: string;
  author?: Author;
  _id: string;
}

interface Note {
  body: string;
  author?: Author;
  _id: string;
}

interface VarItem {
  ns: string;
  name: string;
  type: string;
  doc: string | null;
  arglists: string[];
  examples: Example[] | null;
  notes: Note[] | null;
  see_alsos?: SeeAlso[] | null;
  "see-alsos"?: SeeAlso[] | null;
  href: string;
}

interface ExportData {
  "created-at": number;
  description: string;
  vars: VarItem[];
}

const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

function getChoseong(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 44032;
    if (code > -1 && code < 11172) {
      result += CHOSEONG[Math.floor(code / 588)];
    } else {
      result += str.charAt(i);
    }
  }
  return result.toLowerCase();
}

export default function App() {
  const [data, setData] = useState<ExportData | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('clojure.core');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVarName, setSelectedVarName] = useState<string>('def');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Load Data
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}clojuredocs-translated.json`)
      .then((res) => res.json())
      .then((json: ExportData) => {
        setData(json);
        // Find default or first available var
        if (json.vars && json.vars.length > 0) {
          const coreDef = json.vars.find(v => v.ns === 'clojure.core' && v.name === 'def');
          if (coreDef) {
            setSelectedVarName(`${coreDef.ns}/${coreDef.name}`);
          } else {
            setSelectedVarName(`${json.vars[0].ns}/${json.vars[0].name}`);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load clojuredocs JSON:', err);
      });
  }, []);

  const mainPanelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Shortcut to focus search (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Theme Sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Scroll main panel to top on selection change
  useEffect(() => {
    if (mainPanelRef.current) {
      mainPanelRef.current.scrollTop = 0;
    }
  }, [selectedVarName]);

  // Trigger Syntax Highlighting
  useEffect(() => {
    Prism.highlightAll();
  }, [selectedVarName, data]);

  // Extract all unique namespaces
  const namespaces = useMemo(() => {
    if (!data) return [];
    const nsSet = new Set<string>();
    data.vars.forEach((v) => nsSet.add(v.ns));
    return Array.from(nsSet).sort();
  }, [data]);

  // Filter vars by selected namespace & search query (including choseong)
  const filteredVars = useMemo(() => {
    if (!data) return [];

    return data.vars.filter((v) => {
      // 1. Namespace Filter
      if (selectedNamespace !== 'All' && v.ns !== selectedNamespace) {
        return false;
      }

      // 2. Search Query Filter
      if (!searchQuery) return true;

      const q = searchQuery.toLowerCase().trim();
      const name = v.name.toLowerCase();
      const ns = v.ns.toLowerCase();
      const doc = (v.doc || '').toLowerCase();

      // Check exact match or inclusion
      if (name.includes(q) || ns.includes(q) || doc.includes(q)) {
        return true;
      }

      // Check Korean Initial Consonant (초성) Match
      const nameChoseong = getChoseong(v.name);
      const docChoseong = getChoseong(v.doc || '');
      if (nameChoseong.includes(q) || docChoseong.includes(q)) {
        return true;
      }

      return false;
    });
  }, [data, selectedNamespace, searchQuery]);

  // Get current active Var
  const activeVar = useMemo(() => {
    if (!data || !selectedVarName) return null;
    return data.vars.find((v) => `${v.ns}/${v.name}` === selectedVarName) || null;
  }, [data, selectedVarName]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Convert Markdown safely
  const renderMarkdown = (md: string | null): { __html: string } => {
    if (!md) return { __html: '' };
    return { __html: marked.parse(md) as string };
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">λ</div>
            <div>
              <div className="logo-text">ClojureDocs</div>
              <span className="logo-sub">한글 번역 사이트</span>
            </div>
          </div>

          <div className="search-container">
            <Search className="search-icon" size={18} />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="함수명, 초성 검색 (Ctrl+S)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredVars.length > 0) {
                  const firstVar = filteredVars[0];
                  setSelectedVarName(`${firstVar.ns}/${firstVar.name}`);
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <select
            className="ns-select"
            value={selectedNamespace}
            onChange={(e) => setSelectedNamespace(e.target.value)}
          >
            <option value="All">모든 네임스페이스</option>
            {namespaces.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
        </div>

        <div className="func-list-container">
          {filteredVars.map((v) => {
            const key = `${v.ns}/${v.name}`;
            return (
              <a
                key={key}
                onClick={() => setSelectedVarName(key)}
                className={`func-item ${selectedVarName === key ? 'active' : ''}`}
              >
                <span className="func-item-name">{v.name}</span>
                <span className="func-item-badge">{v.type}</span>
              </a>
            );
          })}
          {filteredVars.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main ref={mainPanelRef} className="main-panel">
        {activeVar ? (
          <>
            {/* Header */}
            <header className="main-header">
              <div className="header-title-container">
                <span className="header-ns">{activeVar.ns}</span>
                <h1 className="header-name">
                  {activeVar.name}
                  <span className={`badge-type ${activeVar.type}`}>
                    {activeVar.type}
                  </span>
                </h1>
              </div>
              <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>
            </header>

            {/* Content Details */}
            <div className="doc-body">
              {/* Arglist Section */}
              {activeVar.arglists && activeVar.arglists.length > 0 && (
                <div className="detail-section">
                  <h2 className="section-title">인자 정의 (Arity)</h2>
                  <div className="arglist-container">
                    {activeVar.arglists.map((args, idx) => (
                      <div key={idx} className="arglist-card">
                        ({activeVar.name} {args})
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description Section */}
              <div className="detail-section">
                <h2 className="section-title">설명 (Description)</h2>
                <div
                  className="docstring-content"
                  dangerouslySetInnerHTML={renderMarkdown(activeVar.doc)}
                />
              </div>

              {/* See Also Section */}
              {(activeVar.see_alsos || activeVar['see-alsos']) && (
                <div className="detail-section">
                  <h2 className="section-title">관련 함수 (See Also)</h2>
                  <div className="see-also-container">
                    {((activeVar.see_alsos || activeVar['see-alsos']) || []).map((ref, idx) => {
                      const to = ref.to_var || ref['to-var'];
                      if (!to) return null;
                      const refKey = `${to.ns}/${to.name}`;
                      return (
                        <a
                          key={idx}
                          className="see-also-link"
                          onClick={() => setSelectedVarName(refKey)}
                        >
                          {to.name}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Examples Section */}
              {activeVar.examples && activeVar.examples.length > 0 && (
                <div className="detail-section">
                  <h2 className="section-title">예제 코드 (Examples)</h2>
                  <div className="card-list">
                    {activeVar.examples.map((ex, idx) => (
                      <div key={ex._id || idx} className="item-card">
                        <div className="card-header">
                          <div className="author-info">
                            {ex.author && (
                              <>
                                <img
                                  className="avatar"
                                  src={ex.author.avatar_url || ex.author['avatar-url']}
                                  alt={ex.author.login}
                                />
                                <span className="author-name">{ex.author.login}</span>
                              </>
                            )}
                          </div>
                          <button
                            className="copy-btn"
                            onClick={() => copyToClipboard(ex.body, ex._id || `ex-${idx}`)}
                          >
                            {copiedId === (ex._id || `ex-${idx}`) ? (
                              <>
                                <Check size={14} /> 복사 완료
                              </>
                            ) : (
                              <>
                                <Copy size={14} /> 복사
                              </>
                            )}
                          </button>
                        </div>
                        <div className="card-body">
                          <pre className="code-container">
                            <code className="language-clojure">{ex.body}</code>
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes Section */}
              {activeVar.notes && activeVar.notes.length > 0 && (
                <div className="detail-section">
                  <h2 className="section-title">참고 노트 (Notes)</h2>
                  <div className="card-list">
                    {activeVar.notes.map((note, idx) => (
                      <div key={note._id || idx} className="item-card" style={{ padding: '20px' }}>
                        <div className="docstring-content" dangerouslySetInnerHTML={renderMarkdown(note.body)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="welcome-screen">
            <div className="welcome-logo">λ</div>
            <h2 className="welcome-title">ClojureDocs 한글판</h2>
            <p className="welcome-desc">
              좌측 목록에서 함수를 선택하거나 검색하여 자세한 공식 한글 설명 및 한글화된 REPL 예제 코드를 살펴보세요.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
