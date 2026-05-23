import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase, type Pedido, type ItemPedido, type SolicitacaoPreco } from '../lib/supabase'

type PedidoComItens = Pedido & { itens_pedido: ItemPedido[] }

// Web Audio API alert sound - Ding-Dong chime + Voice
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
    playTone(659.25, now, 0.8, 'sine', 0.4)
    playTone(523.25, now + 0.4, 1.2, 'sine', 0.4)

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

// Different tone for price change requests (higher pitch)
function playPriceAlert(vendedor: string) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const playTone = (freq: number, startTime: number, duration: number, volume = 0.35) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(volume, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }
    const now = ctx.currentTime
    playTone(880, now, 0.4)
    playTone(1046.5, now + 0.25, 0.4)
    playTone(1318.5, now + 0.5, 0.6)

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(`Solicitação de preço de ${vendedor}`)
      utterance.lang = 'pt-BR'
      utterance.rate = 1.1
      window.speechSynthesis.speak(utterance)
    }, 900)
  } catch (e) {
    console.warn('Audio/Speech error:', e)
  }
}

// Alert sound for pending orders loop (every 10 minutes)
function playPendingOrdersAlert(count: number) {
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
    // Distinct triple warning beep (using triangle wave for a more warning-like buzzer sound)
    playTone(493.88, now, 0.3, 'triangle', 0.35)      // B4
    playTone(493.88, now + 0.4, 0.3, 'triangle', 0.35)  // B4
    playTone(493.88, now + 0.8, 0.5, 'triangle', 0.35)  // B4

    setTimeout(() => {
      const text = count === 1
        ? "Atenção: existe 1 pedido pendente aguardando atendimento."
        : `Atenção: existem ${count} pedidos pendentes aguardando atendimento.`
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'pt-BR'
      utterance.rate = 1.05
      utterance.pitch = 1.0
      window.speechSynthesis.speak(utterance)
    }, 1500)
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
  const [view, setView] = useState<'pendentes' | 'log' | 'precos'>('pendentes')
  const [logPedidos, setLogPedidos] = useState<PedidoComItens[]>([])
  const [loadingLog, setLoadingLog] = useState(false)
  // Price change requests state
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoPreco[]>([])
  const [loadingSolic, setLoadingSolic] = useState(false)
  const [solicitacaoSelecionada, setSolicitacaoSelecionada] = useState<SolicitacaoPreco | null>(null)
  const [novasSolicIds, setNovasSolicIds] = useState<Set<string>>(new Set())
  const [novaSolicAlert, setNovaSolicAlert] = useState<SolicitacaoPreco | null>(null)
  const [notaResposta, setNotaResposta] = useState('')
  const [respondendo, setRespondendo] = useState(false)
  const knownSolicIds = useRef<Set<string>>(new Set())
  const knownIds = useRef<Set<string>>(new Set())

  const pedidosRef = useRef(pedidos)
  useEffect(() => {
    pedidosRef.current = pedidos
  }, [pedidos])

  useEffect(() => {
    const intervalId = setInterval(() => {
      const pendingCount = pedidosRef.current.filter(p => p.status === 'pendente').length
      if (pendingCount > 0) {
        playPendingOrdersAlert(pendingCount)
      }
    }, 10 * 60 * 1000) // 10 minutes

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!user?.nome || user.perfil !== 'logistica') navigate('/')
  }, [])

  const carregarPedidos = useCallback(async () => {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, itens_pedido(*)')
      .in('status', ['pendente', 'em_andamento'])
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
        { event: '*', schema: 'public', table: 'pedidos' },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newPedidoId = payload.new.id
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

              setTimeout(() => {
                setNewCardIds(prev => {
                  const next = new Set(prev)
                  next.delete(newPedidoId)
                  return next
                })
              }, 3000)

              setTimeout(() => setNovoPedidoAlert(null), 5000)
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Pedido
            
            // If it was cancelled or finalized, remove from main list if it's there
            if (updated.status === 'cancelado' || updated.status === 'finalizado') {
              setPedidos(prev => prev.filter(p => p.id !== updated.id))
              knownIds.current.delete(updated.id)
            } else if (updated.status === 'pendente' || updated.status === 'em_andamento') {
              // If it's already in the list, update it. If not (e.g. was edited back to pending), add it.
              setPedidos(prev => {
                const index = prev.findIndex(p => p.id === updated.id)
                if (index !== -1) {
                  const next = [...prev]
                  next[index] = { ...next[index], ...updated }
                  return next
                } else {
                  // Need to fetch full data because update payload might not have items
                  carregarPedidos() 
                  return prev
                }
              })
            }
          } else if (payload.eventType === 'DELETE') {
            setPedidos(prev => prev.filter(p => p.id !== payload.old.id))
            knownIds.current.delete(payload.old.id)
          }
        }
      )
      .subscribe()

    // Subscribe to price change requests
    const channelSolic = supabase
      .channel('solicitacoes-logistica')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_preco' },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const id = payload.new.id
            const { data } = await supabase
              .from('solicitacoes_preco')
              .select('*')
              .eq('id', id)
              .single()

            if (data && !knownSolicIds.current.has(id)) {
              knownSolicIds.current.add(id)
              const solic = data as SolicitacaoPreco
              setSolicitacoes(prev => [solic, ...prev])
              setNovaSolicAlert(solic)
              setNovasSolicIds(prev => new Set([...prev, id]))
              playPriceAlert(solic.vendedor_nome)
              setTimeout(() => {
                setNovasSolicIds(prev => { const n = new Set(prev); n.delete(id); return n })
              }, 3000)
              setTimeout(() => setNovaSolicAlert(null), 5000)
            }
          } else if (payload.eventType === 'UPDATE') {
            setSolicitacoes(prev => prev.filter(s => s.status === 'pendente' ? true : s.id !== payload.new.id))
            carregarSolicitacoes()
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel); supabase.removeChannel(channelSolic) }
  }, [carregarPedidos])

  const carregarLog = async () => {
    setLoadingLog(true)
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, itens_pedido(*)')
      .eq('status', 'finalizado')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) {
      setLogPedidos(data as PedidoComItens[])
    }
    setLoadingLog(false)
  }

  const carregarSolicitacoes = async () => {
    setLoadingSolic(true)
    const { data, error } = await supabase
      .from('solicitacoes_preco')
      .select('*')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })

    if (!error && data) {
      const sData = data as SolicitacaoPreco[]
      sData.forEach(s => knownSolicIds.current.add(s.id))
      setSolicitacoes(sData)
    }
    setLoadingSolic(false)
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
    navigate('/')
  }

  const responderSolicitacao = async (resposta: 'aprovado' | 'recusado') => {
    if (!solicitacaoSelecionada || !operadorNome.trim()) {
      setErrFinalize('Informe seu nome para responder.')
      return
    }
    setRespondendo(true)
    try {
      const { error } = await supabase
        .from('solicitacoes_preco')
        .update({
          status: resposta,
          operador_logistica: operadorNome.trim(),
          nota_resposta: notaResposta.trim() || null,
          respondido_at: new Date().toISOString(),
        })
        .eq('id', solicitacaoSelecionada.id)

      if (error) throw error

      setSolicitacoes(prev => prev.filter(s => s.id !== solicitacaoSelecionada.id))
      knownSolicIds.current.delete(solicitacaoSelecionada.id)
      setSolicitacaoSelecionada(null)
      setNotaResposta('')
      setErrFinalize('')
    } catch (err) {
      console.error(err)
      alert('Erro ao responder solicitação.')
    } finally {
      setRespondendo(false)
    }
  }

  const exportarPedidoExcel = (pedido: PedidoComItens) => {
    const rows = pedido.itens_pedido.map(item => ({
      'ID Pedido': pedido.id.slice(0, 8),
      'Setor': pedido.setor,
      'Vendedor': pedido.vendedor_nome,
      'Data': new Date(pedido.created_at).toLocaleDateString('pt-BR'),
      'Hora': formatTime(pedido.created_at),
      'Status': pedido.status,
      'Operador Logística': pedido.operador_logistica || '-',
      'Produto/Código': item.codigo_produto,
      'Quantidade': item.quantidade
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pedido')
    
    const fileName = `Pedido_${pedido.setor}_${pedido.id.slice(0, 8)}.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  const exportarExcelCompleto = () => {
    if (view === 'precos') {
      if (solicitacoes.length === 0) return
      const rows = solicitacoes.flatMap(s =>
        s.codigos_produto.map(c => ({
          'ID': s.id.slice(0, 8),
          'Setor': s.setor,
          'Vendedor': s.vendedor_nome,
          'Data': new Date(s.created_at).toLocaleDateString('pt-BR'),
          'Hora': formatTime(s.created_at),
          'Código Produto': c,
          'Status': s.status,
          'Motivo': s.motivo || '-',
        }))
      )
      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitacoes')
      XLSX.writeFile(workbook, `LogiSpeed_precos_${new Date().toISOString().slice(0, 10)}.xlsx`)
      return
    }

    const dataToExport = view === 'pendentes' ? pedidos : logPedidos
    if (dataToExport.length === 0) return

    const rows = dataToExport.flatMap(p => 
      p.itens_pedido.map(item => ({
        'ID Pedido': p.id.slice(0, 8),
        'Setor': p.setor,
        'Vendedor': p.vendedor_nome,
        'Data': new Date(p.created_at).toLocaleDateString('pt-BR'),
        'Hora': formatTime(p.created_at),
        'Status': p.status,
        'Operador Logística': p.operador_logistica || '-',
        'Produto/Código': item.codigo_produto,
        'Quantidade': item.quantidade
      }))
    )

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pedidos')
    
    const fileName = `LogiSpeed_${view}_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(workbook, fileName)
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
                📥 Pedidos
              </button>
              <button
                className={`btn btn-sm ${view === 'precos' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setView('precos'); carregarSolicitacoes() }}
                style={{ position: 'relative' }}
              >
                💰 Preços
                {solicitacoes.length > 0 && (
                  <span style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    background: '#ef4444', color: '#fff',
                    borderRadius: '50%', width: '16px', height: '16px',
                    fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700
                  }}>{solicitacoes.length}</span>
                )}
              </button>
              <button
                className={`btn btn-sm ${view === 'log' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setView('log'); carregarLog() }}
              >
                📋 Log
              </button>
            </div>
            <button className="btn btn-ghost" onClick={view === 'pendentes' ? carregarPedidos : view === 'precos' ? carregarSolicitacoes : carregarLog} title="Atualizar">
              🔄
            </button>
            <button 
              className="btn btn-success btn-sm" 
              onClick={exportarExcelCompleto} 
              disabled={(view === 'pendentes' ? pedidos : view === 'precos' ? solicitacoes : logPedidos).length === 0}
              title="Exportar Tudo para Excel"
            >
              📊 Exportar Tudo
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="order-setor">{pedido.setor}</span>
                        <button 
                          className="btn-export-small" 
                          onClick={(e) => { e.stopPropagation(); exportarPedidoExcel(pedido) }}
                          title="Exportar este pedido para Excel"
                        >
                          🟢 Excel
                        </button>
                      </div>
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
        ) : view === 'precos' ? (
          <>
            {loadingSolic ? (
              <div className="empty-state" style={{ marginTop: 48 }}>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <p>Carregando solicitações...</p>
              </div>
            ) : solicitacoes.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 48 }}>
                <div className="empty-icon">💰</div>
                <p style={{ fontSize: '16px', fontWeight: 600 }}>Nenhuma solicitação pendente</p>
                <p>Aguardando solicitações do comercial...</p>
              </div>
            ) : (
              <div className="orders-grid">
                {solicitacoes.map(s => (
                  <div
                    key={s.id}
                    className={`order-card ${novasSolicIds.has(s.id) ? 'new-order' : ''}`}
                    onClick={() => { setSolicitacaoSelecionada(s); setNotaResposta(''); setErrFinalize('') }}
                    style={{ borderLeft: '3px solid #f59e0b' }}
                  >
                    <div className="order-card-header">
                      <span className="order-setor" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                        {s.setor}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className="order-time">{formatTime(s.created_at)}</span>
                        <span className="status-badge status-pendente">
                          <span className="pulse-dot" /> Aguardando
                        </span>
                      </div>
                    </div>
                    <div className="order-vendedor">👤 {s.vendedor_nome}</div>
                    <div className="order-items-count">
                      📋 {s.codigos_produto.length} produto(s) para trocar preço
                    </div>
                    {s.motivo && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        "{s.motivo.slice(0, 60)}{s.motivo.length > 60 ? '...' : ''}"
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
                    onClick={() => {
                      setPedidoSelecionado(pedido)
                      setOperadorNome(pedido.operador_logistica || '')
                      setErrFinalize('')
                    }}
                  >
                    <div className="order-card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="order-setor">{pedido.setor}</span>
                        <button 
                          className="btn-export-small" 
                          onClick={(e) => { e.stopPropagation(); exportarPedidoExcel(pedido) }}
                          title="Exportar este pedido para Excel"
                        >
                          🟢 Excel
                        </button>
                      </div>
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
                ) : pedidoSelecionado.status === 'em_andamento' ? (
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
                ) : (
                  <button className="btn btn-ghost btn-full" onClick={() => setPedidoSelecionado(null)}>
                    Fechar Visualização
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Solicitacao Preco */}
      {solicitacaoSelecionada && (
        <div className="alert-overlay" onClick={e => e.target === e.currentTarget && setSolicitacaoSelecionada(null)}>
          <div className="alert-card">
            <div className="alert-header">
              <h2 className="alert-title">💰 Solicitação de Troca de Preço</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setSolicitacaoSelecionada(null)}>✕</button>
            </div>

            <div className="alert-meta">
              <div className="meta-tag">🏷️ Setor: <strong>{solicitacaoSelecionada.setor}</strong></div>
              <div className="meta-tag">👤 <strong>{solicitacaoSelecionada.vendedor_nome}</strong></div>
              <div className="meta-tag">🕐 <strong>{formatTime(solicitacaoSelecionada.created_at)}</strong></div>
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

            <div className="finalize-section">
              <p className="finalize-label">Logística Responsável (obrigatório)</p>
              <input
                type="text"
                className="form-input"
                placeholder="Seu nome..."
                value={operadorNome}
                onChange={e => { setOperadorNome(e.target.value); setErrFinalize('') }}
              />
              <textarea
                className="form-input"
                style={{ marginTop: '10px', resize: 'vertical', minHeight: '64px', fontFamily: 'inherit', fontSize: '13px' }}
                placeholder="Nota de resposta (opcional)..."
                value={notaResposta}
                onChange={e => setNotaResposta(e.target.value)}
              />
              {errFinalize && (
                <p style={{ color: 'var(--accent-red)', fontSize: '12px', marginTop: 6 }}>
                  ⚠️ {errFinalize}
                </p>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1 }}
                  onClick={() => responderSolicitacao('recusado')}
                  disabled={respondendo}
                >
                  {respondendo ? <><div className="spinner" /> Aguarde...</> : '❌ Recusar'}
                </button>
                <button
                  className="btn btn-success"
                  style={{ flex: 1 }}
                  onClick={() => responderSolicitacao('aprovado')}
                  disabled={respondendo}
                >
                  {respondendo ? <><div className="spinner" /> Aguarde...</> : '✅ Aprovar'}
                </button>
              </div>
              <button className="btn btn-ghost btn-full" style={{ marginTop: '10px' }} onClick={() => setSolicitacaoSelecionada(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popups */}
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
      {novaSolicAlert && (
        <div
          className="new-order-popup"
          style={{ bottom: novoPedidoAlert ? '120px' : '24px', borderColor: '#f59e0b', background: 'rgba(245,158,11,0.12)' }}
          onClick={() => { setSolicitacaoSelecionada(novaSolicAlert); setNotaResposta(''); setErrFinalize(''); setNovaSolicAlert(null) }}
        >
          <div className="popup-icon">💰</div>
          <div className="popup-text">
            <strong>Nova solicitação de preço!</strong>
            <span>{novaSolicAlert.setor} · {novaSolicAlert.vendedor_nome}</span>
          </div>
        </div>
      )}
    </div>
  )
}
