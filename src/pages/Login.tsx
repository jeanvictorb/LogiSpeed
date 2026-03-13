import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const SETORES = [
  'Perfumaria',
  'Acessórios',
  'Bebidas',
  'Eletronicos',
  'Capilar',
  'Moda casual',

]

export function Login() {
  const navigate = useNavigate()
  const [perfil, setPerfil] = useState<'vendedor' | 'logistica' | null>(null)
  const [setor, setSetor] = useState('')
  const [nome, setNome] = useState('')
  const [error, setError] = useState('')

  const handleEntrar = () => {
    if (!perfil) { setError('Selecione um perfil.'); return }
    if (!nome.trim()) { setError('Digite seu nome.'); return }
    if (perfil === 'vendedor' && !setor) { setError('Selecione o setor.'); return }

    const userData = {
      perfil,
      nome: nome.trim(),
      setor: perfil === 'logistica' ? 'Logística' : setor,
    }
    localStorage.setItem('logispeed_user', JSON.stringify(userData))
    navigate(perfil === 'logistica' ? '/logistica' : '/vendedor')
  }

  return (
    <div className="page-center">
      <div className="login-card">
        <div className="login-logo">
          <h1>🚛 LogiSpeed</h1>
          <p>Sistema de Pedidos — Pedido Express</p>
        </div>

        {/* Profile Selector */}
        <div className="profile-selector">
          <div
            className={`profile-option ${perfil === 'vendedor' ? 'selected' : ''}`}
            onClick={() => setPerfil('vendedor')}
          >
            <div className="profile-icon">🧑‍💼</div>
            <div className="profile-name">Vendedor</div>
            <div className="profile-desc">Lançar pedidos</div>
          </div>
          <div
            className={`profile-option ${perfil === 'logistica' ? 'selected' : ''}`}
            onClick={() => setPerfil('logistica')}
          >
            <div className="profile-icon">🏭</div>
            <div className="profile-name">Logística</div>
            <div className="profile-desc">Separar pedidos</div>
          </div>
        </div>

        <div className="divider" />

        {/* Fields */}
        {perfil === 'vendedor' && (
          <div className="form-group">
            <label className="form-label">Setor</label>
            <select
              className="form-select"
              value={setor}
              onChange={e => setSetor(e.target.value)}
            >
              <option value="">Selecione o setor...</option>
              {SETORES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Seu Nome</label>
          <input
            type="text"
            className="form-input"
            placeholder={perfil === 'logistica' ? 'Nome do operador...' : 'Nome do vendedor...'}
            value={nome}
            onChange={e => { setNome(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleEntrar()}
            autoFocus
          />
        </div>

        {error && (
          <p style={{ color: 'var(--accent-red)', fontSize: '13px', marginBottom: '12px' }}>
            ⚠️ {error}
          </p>
        )}

        <button
          className="btn btn-primary btn-lg btn-full"
          onClick={handleEntrar}
          disabled={!perfil}
        >
          Entrar no Sistema →
        </button>

        <p style={{
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '11px',
          marginTop: '20px',
        }}>
          LogiSpeed v1.0 · Sistema Interno
        </p>
      </div>
    </div>
  )
}
