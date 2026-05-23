import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nadvbcorarymyiqoexse.supabase.co'
const supabaseAnonKey = 'sb_publishable_XLY4Bv5nsNyXMqygEJ1Mfw_6806ZMKF'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Pedido = {
  id: string
  vendedor_nome: string
  setor: string
  status: 'pendente' | 'em_andamento' | 'finalizado' | 'cancelado'
  operador_logistica: string | null
  created_at: string
  finalizado_at: string | null
}

export type SolicitacaoPreco = {
  id: string
  vendedor_nome: string
  setor: string
  codigos_produto: string[]
  motivo: string | null
  status: 'pendente' | 'aprovado' | 'recusado'
  operador_logistica: string | null
  nota_resposta: string | null
  created_at: string
  respondido_at: string | null
}

export type ItemPedido = {
  id: string
  pedido_id: string
  codigo_produto: string
  quantidade: number
  created_at: string
}
