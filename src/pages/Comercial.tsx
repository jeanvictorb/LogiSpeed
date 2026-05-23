import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase, type SolicitacaoPreco } from '../lib/supabase'

export function Comercial() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('logispeed_user') || '{}')

  const [codigo, setCodigo] = useState('')
  const [codigos, setCodigos] = useState<string[]>([])
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [minhasSolicitacoes, setMinhasSolicitacoes] = useState<SolicitacaoPreco[]>([])
  const [loadingSolic, setLoadingSolic] = useState(true)
  const [solicitacaoSelecionada, setSolicitacaoSelecionada] = useState<SolicitacaoPreco | null>(null)
  const [importando, setImportando] = useState(false)

  const codigoRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user?.nome || user.perfil !== 'comercial') navigate('/')
    codigoRef.current?.focus()
    carregarSolicitacoes()

    const channel = supabase
      .channel(`comercial-solicitacoes-${user.nome}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_preco' },
        () => carregarSolicitacoes()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const carregarSolicitacoes = async () => {
    const { data, error } = await supabase
      .from('solicitacoes_preco')
      .select('*')
      .eq('vendedor_nome', user.nome)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!error && data) {
      setMinhasSolicitacoes(data as SolicitacaoPreco[])
    }
    setLoadingSolic(false)
  }

  const adicionarCodigo = () => {
    const c = codigo.trim().toUpperCase()
    if (!c || codigos.includes(c)) { setCodigo(''); return }
    setCodigos(prev => [...prev, c])
    setCodigo('')
    codigoRef.current?.focus()
  }

  const removerCodigo = (c: string) => {
    setCodigos(prev => prev.filter(x => x !== c))
  }

  const handleCodigoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      adicionarCodigo()
    }
  }

  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 })

        const novos: string[] = []
        rows.forEach((row: any[]) => {
          row.forEach((cell: any) => {
            const val = String(cell ?? '').trim().toUpperCase()
            if (val && !codigos.includes(val) && !novos.includes(val)) {
              novos.push(val)
            }
          })
        })

        setCodigos(prev => {
          const combined = [...prev, ...novos.filter(n => !prev.includes(n))]
          return combined
        })
        alert(`✅ ${novos.length} código(s) importado(s) do Excel.`)
      } catch {
        alert('❌ Erro ao ler a planilha. Verifique o formato do arquivo.')
      } finally {
        setImportando(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const enviarSolicitacao = async () => {
    if (codigos.length === 0) return
    setEnviando(true)

    try {
      const { error } = await supabase
        .from('solicitacoes_preco')
        .insert({
          vendedor_nome: user.nome,
          setor: user.setor,
          codigos_produto: codigos,
          motivo: motivo.trim() || null,
          status: 'pendente',
        })

      if (error) throw error

      setCodigos([])
      setMotivo('')
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    } catch (err) {
      console.error(err)
      alert('Erro ao enviar solicitação. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  const sair = () => {
    localStorage.removeItem('logispeed_user')
    navigate('/')
  }

  const statusInfo = (status: string) => {
    switch (status) {
      case 'pendente': return { label: 'Aguardando', emoji: '🕐', cls: 'status-pendente' }
      case 'aprovado': return { label: 'Aprovado', emoji: '✅', cls: 'status-finalizado' }
      case 'recusado': return { label: 'Recusado', emoji: '❌', cls: 'status-cancelado' }
      default: return { label: status, emoji: '•', cls: '' }
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-logo">
          🚛 <span>LogiSpeed</span>
        </div>
        <div className="header-info">
          <div className="user-badge">
            💼 <span>{user.setor}</span> • <strong>{user.nome}</strong>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={sair}>Sair</button>
        </div>
      </header>

      <div className="vendedor-layout">
        {/* Painel de Input */}
        <div className="input-panel">
          <div className="card">
            <h2>💰 Solicitação de Troca de Preço</h2>

            {/* Campo de código */}
            <div className="form-group">
              <label className="form-label">Código do Produto</label>
              <div className="input-row">
                <input
                  ref={codigoRef}
                  type="text"
                  className="form-input large"
                  placeholder="Escaneie ou digite..."
                  value={codigo}
                  onChange={e => setCodigo(e.target.value)}
                  onKeyDown={handleCodigoKeyDown}
                  autoComplete="off"
                />
                <button
                  className="btn btn-primary"
                  onClick={adicionarCodigo}
                  disabled={!codigo.trim()}
                >
                  ＋ Add
                </button>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                💡 Pressione <strong>Enter</strong> para adicionar o código.
              </p>
            </div>

            {/* Upload Excel */}
            <div className="form-group">
              <label className="form-label">Importar via Planilha Excel</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1, border: '1.5px dashed var(--border)', justifyContent: 'center' }}
                  onClick={() => fileRef.current?.click()}
                  disabled={importando}
                >
                  {importando ? (
                    <><div className="spinner" style={{ width: 14, height: 14 }} /> Importando...</>
                  ) : (
                    <>📂 Selecionar Planilha (.xlsx / .xls)</>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={importarExcel}
                />
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                📋 Os códigos serão lidos de todas as células da primeira aba da planilha.
              </p>
            </div>

            {/* Motivo */}
            <div className="form-group">
              <label className="form-label">Motivo <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
              <textarea
                className="form-input"
                style={{ resize: 'vertical', minHeight: '72px', fontFamily: 'inherit', fontSize: '14px' }}
                placeholder="Descreva o motivo da solicitação..."
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
              />
            </div>

            <div className="send-section">
              <button
                className="btn btn-success btn-lg btn-full"
                onClick={enviarSolicitacao}
                disabled={codigos.length === 0 || enviando}
              >
                {enviando ? (
                  <><div className="spinner" /> Enviando...</>
                ) : (
                  <>📨 Enviar Solicitação ({codigos.length} {codigos.length === 1 ? 'produto' : 'produtos'})</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Produtos + Histórico */}
        <div className="item-list-panel">
          {/* Lista de códigos adicionados */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <h2>
              Produtos da Solicitação
              <span className="item-count-badge">{codigos.length}</span>
            </h2>

            {codigos.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💰</div>
                <p>Nenhum produto adicionado.<br />Use o painel ao lado para adicionar códigos.</p>
              </div>
            ) : (
              <table className="items-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Código do Produto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {codigos.map((c, idx) => (
                    <tr key={c}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                      <td><span className="item-code">{c}</span></td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => removerCodigo(c)}
                          title="Remover"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Histórico de solicitações */}
          <div className="card">
            <h2>📋 Minhas Solicitações</h2>
            {loadingSolic ? (
              <div className="empty-state">
                <div className="spinner" style={{ width: 24, height: 24 }} />
                <p>Carregando...</p>
              </div>
            ) : minhasSolicitacoes.length === 0 ? (
              <div className="empty-state">
                <p>Nenhuma solicitação enviada ainda.</p>
              </div>
            ) : (
              <div className="orders-mini-list">
                {minhasSolicitacoes.map(s => {
                  const info = statusInfo(s.status)
                  return (
                    <div
                      key={s.id}
                      className="order-mini-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSolicitacaoSelecionada(s)}
                    >
                      <div className="order-mini-info">
                        <span className="order-mini-time">
                          {new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="order-mini-setor" style={{ fontSize: '11px' }}>
                          {s.codigos_produto.length} produto(s)
                        </span>
                      </div>
                      <div className="order-mini-status">
                        <span className={`status-badge ${info.cls}`} style={{ fontSize: '11px' }}>
                          {info.emoji} {info.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Detalhes */}
      {solicitacaoSelecionada && (
        <div className="alert-overlay" onClick={e => e.target === e.currentTarget && setSolicitacaoSelecionada(null)}>
          <div className="alert-card">
            <div className="alert-header">
              <h2 className="alert-title">💰 Detalhes da Solicitação</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setSolicitacaoSelecionada(null)}>✕</button>
            </div>

            <div className="alert-meta">
              <div className="meta-tag">🏷️ Setor: <strong>{solicitacaoSelecionada.setor}</strong></div>
              <div className="meta-tag">🕐 <strong>{new Date(solicitacaoSelecionada.created_at).toLocaleString('pt-BR')}</strong></div>
            </div>

            <div className="alert-items">
              <div className="alert-items-header">
                <span>Código do Produto</span>
              </div>
              {solicitacaoSelecionada.codigos_produto.map((c, i) => (
                <div key={i} className="alert-item-row">
                  <span className="alert-item-code">{c}</span>
                </div>
              ))}
            </div>

            {solicitacaoSelecionada.motivo && (
              <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong>Motivo:</strong> {solicitacaoSelecionada.motivo}
              </div>
            )}

            <div style={{ marginTop: '16px' }}>
              {(() => {
                const info = statusInfo(solicitacaoSelecionada.status)
                return (
                  <div className={`status-badge ${info.cls}`} style={{ display: 'inline-flex', padding: '8px 16px', fontSize: '14px' }}>
                    {info.emoji} {info.label}
                    {solicitacaoSelecionada.operador_logistica && ` por ${solicitacaoSelecionada.operador_logistica}`}
                  </div>
                )
              })()}

              {solicitacaoSelecionada.nota_resposta && (
                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', borderLeft: '3px solid var(--accent-blue)' }}>
                  <strong>Nota da Logística:</strong><br />{solicitacaoSelecionada.nota_resposta}
                </div>
              )}
            </div>

            <button className="btn btn-ghost btn-full" style={{ marginTop: '16px' }} onClick={() => setSolicitacaoSelecionada(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {sucesso && (
        <div className="success-toast">
          ✅ Solicitação enviada! A logística foi notificada.
        </div>
      )}
    </div>
  )
}
