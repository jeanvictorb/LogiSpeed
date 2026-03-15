import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type ItemLocal = {
  codigo_produto: string
  quantidade: number
  id: string
}

export function Vendedor() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('logispeed_user') || '{}')
  
  const [codigo, setCodigo] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [itens, setItens] = useState<ItemLocal[]>([])
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [meusPedidos, setMeusPedidos] = useState<any[]>([])
  const [loadingPedidos, setLoadingPedidos] = useState(true)
  const [pedidoSelecionado, setPedidoSelecionado] = useState<any | null>(null)
  
  const codigoRef = useRef<HTMLInputElement>(null)
  const qtdRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user?.nome) navigate('/')
    codigoRef.current?.focus()
    carregarMeusPedidos()

    // Realtime subscription
    let channelSubscription: any
    
    if (user.perfil === 'logistica') {
      channelSubscription = supabase
        .channel('all-pedidos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => carregarMeusPedidos())
    } else {
      // Every other sector sees all orders from their own sector
      channelSubscription = supabase
        .channel(`${user.setor}-pedidos`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'pedidos',
          filter: `setor=eq.${user.setor}`
        }, () => carregarMeusPedidos())
    }

    channelSubscription.subscribe()

    return () => { supabase.removeChannel(channelSubscription) }
  }, [])

  const carregarMeusPedidos = async () => {
    let query = supabase
      .from('pedidos')
      .select('*, itens_pedido(*)')
      .order('created_at', { ascending: false })
      .limit(10)

    if (user.perfil !== 'logistica') {
      query = query.eq('setor', user.setor)
    }

    const { data, error } = await query

    if (!error && data) {
      setMeusPedidos(data)
    }
    setLoadingPedidos(false)
  }

  const handleCodigoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (codigo.trim()) {
        qtdRef.current?.focus()
        qtdRef.current?.select()
      }
    }
  }

  const handleQtdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      adicionarItem()
    }
  }

  const adicionarItem = () => {
    const qty = parseInt(quantidade)
    if (!codigo.trim() || isNaN(qty) || qty <= 0) return

    const novoItem: ItemLocal = {
      id: crypto.randomUUID(),
      codigo_produto: codigo.trim().toUpperCase(),
      quantidade: qty,
    }

    setItens(prev => [...prev, novoItem])
    setCodigo('')
    setQuantidade('1')
    codigoRef.current?.focus()
  }

  const removerItem = (id: string) => {
    setItens(prev => prev.filter(i => i.id !== id))
  }

  const enviarPedido = async () => {
    if (itens.length === 0) return
    setEnviando(true)

    try {
      const { data: pedido, error: pedidoError } = await supabase
        .from('pedidos')
        .insert({
          vendedor_nome: user.nome,
          setor: user.setor,
          status: 'pendente',
        })
        .select()
        .single()

      if (pedidoError) throw pedidoError

      const itensSave = itens.map(item => ({
        pedido_id: pedido.id,
        codigo_produto: item.codigo_produto,
        quantidade: item.quantidade,
      }))

      const { error: itensError } = await supabase
        .from('itens_pedido')
        .insert(itensSave)

      if (itensError) throw itensError

      setItens([])
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    } catch (err) {
      console.error(err)
      alert('Erro ao enviar pedido. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  const sair = () => {
    localStorage.removeItem('logispeed_user')
    navigate('/')
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-logo">
          🚛 <span>LogiSpeed</span>
        </div>
        <div className="header-info">
          <div className="user-badge">
            🏷️ <span>{user.setor}</span> • <strong>{user.nome}</strong>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={sair}>Sair</button>
        </div>
      </header>

      <div className="vendedor-layout">
        {/* Painel de Input */}
        <div className="input-panel">
          <div className="card">
            <h2>📦 Novo Pedido</h2>

            <div className="form-group">
              <label className="form-label">Código do Produto</label>
              <input
                ref={codigoRef}
                type="text"
                className="form-input large"
                placeholder="Escaneie ou digite..."
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                onKeyDown={handleCodigoKeyDown}
                autoFocus
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Quantidade</label>
              <div className="input-row">
                <input
                  ref={qtdRef}
                  type="number"
                  className="form-input qty"
                  min="1"
                  value={quantidade}
                  onChange={e => setQuantidade(e.target.value)}
                  onKeyDown={handleQtdKeyDown}
                />
                <button
                  className="btn btn-primary"
                  onClick={adicionarItem}
                  disabled={!codigo.trim()}
                >
                  ＋ Add
                </button>
              </div>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              💡 Pressione <strong>Enter</strong> no código para ir à quantidade, e <strong>Enter</strong> na quantidade para adicionar.
            </p>

            <div className="send-section">
              <button
                className="btn btn-success btn-lg btn-full"
                onClick={enviarPedido}
                disabled={itens.length === 0 || enviando}
              >
                {enviando ? (
                  <><div className="spinner" /> Enviando...</>
                ) : (
                  <>✅ Enviar Pedido ({itens.length} {itens.length === 1 ? 'item' : 'itens'})</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Itens */}
        <div className="item-list-panel">
          <div className="card" style={{ marginBottom: '24px' }}>
            <h2>
              Lista do Pedido
              <span className="item-count-badge">{itens.length}</span>
            </h2>

            {itens.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p>Nenhum item adicionado.<br />Use o painel ao lado para adicionar produtos.</p>
              </div>
            ) : (
              <table className="items-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Código do Produto</th>
                    <th>Quantidade</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                      <td><span className="item-code">{item.codigo_produto}</span></td>
                      <td><span className="item-qty">{item.quantidade}</span></td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => removerItem(item.id)}
                          title="Remover item"
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

          <div className="card">
            <h2>🚚 Acompanhamento de Pedidos</h2>
            {loadingPedidos ? (
              <div className="empty-state">
                <div className="spinner" style={{ width: 24, height: 24 }} />
                <p>Carregando seus pedidos...</p>
              </div>
            ) : meusPedidos.length === 0 ? (
              <div className="empty-state">
                <p>Você ainda não enviou nenhum pedido.</p>
              </div>
            ) : (
              <div className="orders-mini-list">
                {meusPedidos.map(p => (
                  <div 
                    key={p.id} 
                    className="order-mini-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setPedidoSelecionado(p)}
                  >
                    <div className="order-mini-info">
                      <span className="order-mini-time">{new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="order-mini-setor">{p.setor}</span>
                    </div>
                    <div className="order-mini-status">
                      <span className={`status-badge status-${p.status}`}>
                        {p.status === 'pendente' && <><span className="pulse-dot" /> Pendente</>}
                        {p.status === 'em_andamento' && <><span className="pulse-dot blue" /> Em Andamento</>}
                        {p.status === 'finalizado' && <>✅ Finalizado</>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Detalhes (Vendedor) */}
      {pedidoSelecionado && (
        <div className="alert-overlay" onClick={e => e.target === e.currentTarget && setPedidoSelecionado(null)}>
          <div className="alert-card">
            <div className="alert-header">
              <h2 className="alert-title">📋 Detalhes do Pedido</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setPedidoSelecionado(null)}>✕</button>
            </div>

            <div className="alert-meta">
              <div className="meta-tag">🏷️ Setor: <strong>{pedidoSelecionado.setor}</strong></div>
              <div className="meta-tag">👤 <strong>{pedidoSelecionado.vendedor_nome}</strong></div>
              <div className="meta-tag">🕐 <strong>{new Date(pedidoSelecionado.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></div>
            </div>

            <div className="alert-items">
              <div className="alert-items-header">
                <span>Código do Produto</span>
                <span>Qtd.</span>
              </div>
              {pedidoSelecionado.itens_pedido?.map((item: any) => (
                <div key={item.id} className="alert-item-row">
                  <span className="alert-item-code">{item.codigo_produto}</span>
                  <span className="alert-item-qty">{item.quantidade}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '20px' }}>
              <div className={`status-badge status-${pedidoSelecionado.status}`} style={{ display: 'inline-flex', padding: '8px 16px', fontSize: '14px' }}>
                {pedidoSelecionado.status === 'pendente' && 'Aguardando Logística'}
                {pedidoSelecionado.status === 'em_andamento' && `Em Separação por ${pedidoSelecionado.operador_logistica || '...'}`}
                {pedidoSelecionado.status === 'finalizado' && `Finalizado por ${pedidoSelecionado.operador_logistica}`}
              </div>
              <button className="btn btn-ghost btn-full" style={{ marginTop: '12px' }} onClick={() => setPedidoSelecionado(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {sucesso && (
        <div className="success-toast">
          ✅ Pedido enviado com sucesso! A logística foi notificada.
        </div>
      )}
    </div>
  )
}
