import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase, type Pedido, type ItemPedido } from '../lib/supabase'

type PedidoComItens = Pedido & { itens_pedido: ItemPedido[] }

// Web Audio API alert sound - Ding-Dong chime + Voice "Pedido de [setor]"
function playOrderAlert(setor: string) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()

    const playTone = (freq: number, startTime: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = type
      gain.gain.setValueAtTime(volume, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }

    const now = ctx.currentTime
    // "Ding" (E5)
    playTone(659.25, now, 0.8, 'sine', 0.4)
    // "Dong" (C5) - slightly lower and starts after the ding
    playTone(523.25, now + 0.4, 1.2, 'sine', 0.4)

    // Voice synthesis "Pedido de [setor]"
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(`Pedido de ${setor}`)
      utterance.lang = 'pt-BR'
      utterance.rate = 1.1
      utterance.pitch = 1.0
      window.speechSynthesis.speak(utterance)
    }, 1000)

  } catch (e) {
    console.warn('Audio/Speech error:', e)
  }
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
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
  const [view, setView] = useState<'pendentes' | 'log'>('pendentes')
  const [logPedidos, setLogPedidos] = useState<PedidoComItens[]>([])
  const [loadingLog, setLoadingLog] = useState(false)
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
            playOrderAlert(pedidoCompleto.setor)

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

  const carregarLog = async () => {
    setLoadingLog(true)
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, itens_pedido(*)')
      .neq('status', 'pendente')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) {
      setLogPedidos(data as PedidoComItens[])
    }
    setLoadingLog(false)
  }

  const atenderPedido = async () => {
    if (!pedidoSelecionado) return
    if (!operadorNome.trim()) {
      setErrFinalize('Informe o seu nome para atender o pedido.')
      return
    }

    try {
      const { error } = await supabase
        .from('pedidos')
        .update({
          status: 'em_andamento',
          operador_logistica: operadorNome.trim(),
        })
        .eq('id', pedidoSelecionado.id)

      if (error) throw error

      setPedidos(prev => prev.map(p => 
        p.id === pedidoSelecionado.id 
          ? { ...p, status: 'em_andamento', operador_logistica: operadorNome.trim() } 
          : p
      ))
      setPedidoSelecionado(prev => prev ? { ...prev, status: 'em_andamento', operador_logistica: operadorNome.trim() } : null)
      setErrFinalize('')
    } catch (err) {
      console.error(err)
      alert('Erro ao iniciar atendimento.')
    }
  }

  const finalizarPedido = async () => {
    if (!pedidoSelecionado) return
    if (!operadorNome.trim()) {
      setErrFinalize('Por favor, informe seu nome para finalizar.')
      return
    }
    setFinalizando(true)
    setErrFinalize('')

    try {
      // Finalize in DB
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
              {view === 'pendentes' ? '📦 Pedidos Pendentes' : '📋 Log de Pedidos'}
              {view === 'pendentes' && pedidos.length > 0 && (
                <span className="item-count-badge">{pedidos.length}</span>
              )}
            </h1>
            <p className="page-subtitle">
              {view === 'pendentes' 
                ? 'Monitorando novos pedidos em tempo real. Clique em um card para ver os detalhes.' 
                : 'Histórico de pedidos atendidos e finalizados.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="tab-group">
              <button 
                className={`btn btn-sm ${view === 'pendentes' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setView('pendentes')}
              >
                📥 Pendentes
              </button>
              <button 
                className={`btn btn-sm ${view === 'log' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setView('log'); carregarLog() }}
              >
                📋 Log
              </button>
            </div>
            <button className="btn btn-ghost" onClick={view === 'pendentes' ? carregarPedidos : carregarLog} title="Atualizar">
              🔄
            </button>
          </div>
        </div>

        {view === 'pendentes' ? (
          <>
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
                    onClick={() => { setPedidoSelecionado(pedido); setOperadorNome(pedido.operador_logistica || ''); setErrFinalize('') }}
                  >
                    <div className="order-card-header">
                      <span className="order-setor">{pedido.setor}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className="order-time">{formatTime(pedido.created_at)}</span>
                        <span className={`status-badge status-${pedido.status}`}>
                          {pedido.status === 'pendente' ? (
                            <><span className="pulse-dot" /> Pendente</>
                          ) : (
                            <><span className="pulse-dot blue" /> Em Andamento</>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="order-vendedor">👤 {pedido.vendedor_nome}</div>
                    <div className="order-items-count">
                      📋 {pedido.itens_pedido.length} {pedido.itens_pedido.length === 1 ? 'item' : 'itens'} no pedido
                    </div>
                    {pedido.operador_logistica && (
                      <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        🛠️ Em atendimento por: <strong>{pedido.operador_logistica}</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {loadingLog ? (
              <div className="empty-state" style={{ marginTop: 48 }}>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <p>Carregando log de pedidos...</p>
              </div>
            ) : logPedidos.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 48 }}>
                <p>Nenhum histórico encontrado.</p>
              </div>
            ) : (
              <div className="orders-grid">
                {logPedidos.map(pedido => (
                  <div
                    key={pedido.id}
                    className="order-card"
                    style={{ cursor: 'default' }}
                  >
                    <div className="order-card-header">
                      <span className="order-setor">{pedido.setor}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className="order-time">{formatTime(pedido.created_at)}</span>
                        <span className={`status-badge status-${pedido.status}`}>
                          {pedido.status === 'finalizado' ? '✅ Finalizado' : <><span className="pulse-dot blue" /> Em Andamento</>}
                        </span>
                      </div>
                    </div>
                    <div className="order-vendedor">👤 {pedido.vendedor_nome}</div>
                    {pedido.operador_logistica && (
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        🏭 {pedido.operador_logistica}
                      </div>
                    )}
                    <div className="order-items-count">
                      📋 {pedido.itens_pedido.length} {pedido.itens_pedido.length === 1 ? 'item' : 'itens'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
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



            <div className="finalize-section">
              <p className="finalize-label">Logística Responsável (obrigatório)</p>
              <input
                type="text"
                className="form-input"
                placeholder="Seu nome..."
                value={operadorNome}
                onChange={e => { setOperadorNome(e.target.value); setErrFinalize('') }}
              />
              {errFinalize && (
                <p style={{ color: 'var(--accent-red)', fontSize: '12px', marginTop: 6 }}>
                  ⚠️ {errFinalize}
                </p>
              )}
              <div className="finalize-actions" style={{ marginTop: '20px' }}>
                {pedidoSelecionado.status === 'pendente' ? (
                  <button
                    className="btn btn-primary btn-full"
                    onClick={atenderPedido}
                  >
                    🚀 Iniciar Atendimento
                  </button>
                ) : (
                  <div style={{ width: '100%', display: 'flex', gap: '10px' }}>
                    <button className="btn btn-ghost" onClick={() => setPedidoSelecionado(null)}>
                      Fechar
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
                )}
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
