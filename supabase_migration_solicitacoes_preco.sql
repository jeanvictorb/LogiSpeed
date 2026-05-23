-- =============================================
-- Executar no Supabase SQL Editor
-- Tabela: solicitacoes_preco
-- =============================================

CREATE TABLE IF NOT EXISTS public.solicitacoes_preco (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_nome text NOT NULL,
  setor text NOT NULL,
  codigos_produto text[] NOT NULL DEFAULT '{}',
  motivo text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado')),
  operador_logistica text,
  nota_resposta text,
  created_at timestamptz NOT NULL DEFAULT now(),
  respondido_at timestamptz
);

-- Habilita Row Level Security
ALTER TABLE public.solicitacoes_preco ENABLE ROW LEVEL SECURITY;

-- Política de acesso anônimo (igual à tabela pedidos)
CREATE POLICY "Allow all anon solicitacoes" ON public.solicitacoes_preco
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Habilita publicação para Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes_preco;
