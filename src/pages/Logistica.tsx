import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase, type Pedido, type ItemPedido } from '../lib/supabase'

type PedidoComItens = Pedido & { itens_pedido: ItemPedido[] }

// Web Audio API bell sound
function playBell() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }

    playTone(880, ctx.currentTime, 0.3)
    playTone(1100, ctx.currentTime + 0.15, 0.3)
    playTone(1320, ctx.currentTime + 0.3, 0.5)
  } catch (e) {
    console.warn('Audio not available:', e)
  }
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function exportToExcel(pedido: PedidoComItens) {
  const wb = XLSX.utils.book_new()
  
  const wsData: (string | number)[][] = [
    [`Pedido: ${pedido.setor}`, ''],
    [`Feito por: ${pedido.vendedor_nome}`, ''],
    ['Código do Produto', 'Quantidade'],
    ...pedido.itens_pedido.map(item => [item.codigo_produto, item.quantidade]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Merge cells for header rows
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
  ]

  // Column widths
  ws['!cols'] = [{ wch: 30 }, { wch: 15 }]

  XLSX.utils.book_append_sheet(wb, ws, 'Pedido')

  const dateStr = new Date(pedido.created_at)
    .toLocaleDateString('pt-BR')
    .replace(/\//g, '-')
  const timeStr = new Date(pedido.created_at)
    .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    .replace(':', 'h')

  XLSX.writeFile(wb, `Pedido_${pedido.setor.replace(/\s+/g, '_')}_${dateStr}_${timeStr}.xlsx`)
}

export function Logistica() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('logispeed_user') || '{}')

  const [pedidos, setPedidos] = useState<PedidoComItens[]>([])
  const [novoPedidoAlert, setNovoPedidoAlert] = useState<PedidoComItens | null>(null)
  const [pedidoSelecionado, setPedidoSelecionado] = useState<PedidoComItens | null>(null)
  const [operadorNome, setOperadorNome] = useState('')
  const [finalizando, setFinalizando] = useState(false)
  const [newCardIds, setNewCardIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [errFinalize, setErrFinalize] = useState('')
  const knownIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!user?.nome || user.perfil !== 'logistica') navigate('/')
  }, [])

  const carregarPedidos = useCallback(async () => {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, itens_pedido(*)')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })

    if (!error && data) {
      const pedidosData = data as PedidoComItens[]
      
      // Track which IDs we already know
      pedidosData.forEach(p => knownIds.current.add(p.id))
      setPedidos(pedidosData)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    carregarPedidos()

    // Subscribe to Realtime
    const channel = supabase
      .channel('pedidos-logistica')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        async (payload) => {
          const newPedidoId = payload.new.id
          
          // Fetch full data with items
          const { data } = await supabase
            .from('pedidos')
            .select('*, itens_pedido(*)')
            .eq('id', newPedidoId)
            .single()

          if (data && !knownIds.current.has(newPedidoId)) {
            knownIds.current.add(newPedidoId)
            const pedidoCompleto = data as PedidoComItens
            
            setPedidos(prev => [pedidoCompleto, ...prev])
            setNovoPedidoAlert(pedidoCompleto)
            setNewCardIds(prev => new Set([...prev, newPedidoId]))
            playBell()

            // Remove new animation after 3s
            setTimeout(() => {
              setNewCardIds(prev => {
                const next = new Set(prev)
                next.delete(newPedidoId)
                return next
              })
            }, 3000)

            // Auto-dismiss alert after 5s
            setTimeout(() => setNovoPedidoAlert(null), 5000)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [carregarPedidos])

  const finalizarPedido = async () => {
    if (!pedidoSelecionado) return
    if (!operadorNome.trim()) {
      setErrFinalize('Por favor, informe seu nome para finalizar.')
      return
    }
    setFinalizando(true)
    setErrFinalize('')

    try {
      // 1. Download Excel first
      exportToExcel(pedidoSelecionado)

      // 2. Then finalize in DB
      const { error } = await supabase
        .from('pedidos')
        .update({
          status: 'finalizado',
          operador_logistica: operadorNome.trim(),
          finalizado_at: new Date().toISOString(),
        })
        .eq('id', pedidoSelecionado.id)

      if (error) throw error

      setPedidos(prev => prev.filter(p => p.id !== pedidoSelecionado.id))
      knownIds.current.delete(pedidoSelecionado.id)
      setPedidoSelecionado(null)
      setOperadorNome('')
    } catch (err) {
      console.error(err)
      alert('Erro ao finalizar pedido.')
    } finally {
      setFinalizando(false)
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
          <span className="realtime-badge">
            <span className="realtime-dot" /> Tempo Real
          </span>
          <div className="user-badge">
            🏭 Logística • <strong>{user.nome}</strong>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={sair}>Sair</button>
        </div>
      </header>

      <div className="logistica-layout">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <h1 className="page-title">
              📦 Pedidos Pendentes
              {pedidos.length > 0 && (
                <span className="item-count-badge">{pedidos.length}</span>
              )}
            </h1>
            <p className="page-subtitle">
              Monitorando novos pedidos em tempo real. Clique em um card para ver os detalhes e baixar o Excel.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={carregarPedidos} title="Atualizar">
            🔄 Atualizar
          </button>
        </div>

        {loading ? (
          <div className="empty-state" style={{ marginTop: 48 }}>
            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <p>Carregando pedidos...</p>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 48 }}>
            <div className="empty-icon">✅</div>
            <p style={{ fontSize: '16px', fontWeight: 600 }}>Tudo em dia!</p>
            <p>Nenhum pedido pendente. Aguardando novos pedidos...</p>
          </div>
        ) : (
          <div className="orders-grid">
            {pedidos.map(pedido => (
              <div
                key={pedido.id}
                className={`order-card ${newCardIds.has(pedido.id) ? 'new-order' : ''}`}
                onClick={() => { setPedidoSelecionado(pedido); setOperadorNome(''); setErrFinalize('') }}
              >
                <div className="order-card-header">
                  <span className="order-setor">{pedido.setor}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="order-time">{formatTime(pedido.created_at)}</span>
                    <span className="status-badge status-pendente">
                      <span className="pulse-dot" /> Pendente
                    </span>
                  </div>
                </div>
                <div className="order-vendedor">👤 {pedido.vendedor_nome}</div>
                <div className="order-items-count">
                  📋 {pedido.itens_pedido.length} {pedido.itens_pedido.length === 1 ? 'item' : 'itens'} no pedido
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Detalhes */}
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
              <div className="meta-tag">🕐 <strong>{formatTime(pedidoSelecionado.created_at)}</strong></div>
            </div>

            <div className="alert-items">
              <div className="alert-items-header">
                <span>Código do Produto</span>
                <span>Qtd.</span>
              </div>
              {pedidoSelecionado.itens_pedido.map(item => (
                <div key={item.id} className="alert-item-row">
                  <span className="alert-item-code">{item.codigo_produto}</span>
                  <span className="alert-item-qty">{item.quantidade}</span>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={() => exportToExcel(pedidoSelecionado)}
              style={{ marginBottom: 16 }}
            >
              📥 Baixar Excel
            </button>

            <div className="finalize-section">
              <p className="finalize-label">Finalizado por (obrigatório)</p>
              <input
                type="text"
                className="form-input"
                placeholder="Digite seu nome para confirmar..."
                value={operadorNome}
                onChange={e => { setOperadorNome(e.target.value); setErrFinalize('') }}
                onKeyDown={e => e.key === 'Enter' && finalizarPedido()}
                autoFocus
              />
              {errFinalize && (
                <p style={{ color: 'var(--accent-red)', fontSize: '12px', marginTop: 6 }}>
                  ⚠️ {errFinalize}
                </p>
              )}
              <div className="finalize-actions">
                <button className="btn btn-ghost" onClick={() => setPedidoSelecionado(null)}>
                  Cancelar
                </button>
                <button
                  className="btn btn-success"
                  style={{ flex: 1 }}
                  onClick={finalizarPedido}
                  disabled={finalizando}
                >
                  {finalizando ? <><div className="spinner" /> Finalizando...</> : '✅ Finalizar Pedido'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Order Popup */}
      {novoPedidoAlert && (
        <div
          className="new-order-popup"
          onClick={() => { setPedidoSelecionado(novoPedidoAlert); setNovoPedidoAlert(null) }}
        >
          <div className="popup-icon">🔔</div>
          <div className="popup-text">
            <strong>Novo pedido chegou!</strong>
            <span>{novoPedidoAlert.setor} · {novoPedidoAlert.vendedor_nome}</span>
          </div>
        </div>
      )}
    </div>
  )
}
