# 🚛 LogiSpeed — Pedido Express

Sistema web de alto desempenho para agilizar o fluxo de separação de mercadorias, conectando o time de **Vendas** à **Logística** em tempo real.

## 🎯 Objetivo
Substituir processos manuais por uma interface digital de lançamento rápido. O sistema garante que a logística receba os dados prontos para separação e processamento em Excel, eliminando erros de digitação e atrasos no fluxo.

---

## 🚀 Tecnologias
- **Frontend:** React + TypeScript + Vite
- **Banco de Dados:** Supabase (Postgres)
- **Realtime:** Supabase Realtime (para alertas instantâneos)
- **Estilização:** Vanilla CSS (Modern Dark Premium UI)
- **Excel:** SheetJS (xlsx)

---

## 📦 Funcionalidades

### 🧑‍💼 Módulo do Vendedor
- **Login Rápido:** Identificação por Setor e Nome.
- **Lançamento em Lote:** Digitação ultra-rápida (otimizada para leitores de código de barras).
- **Auto-foco Inteligente:** Fluxo fluido entre Código → Quantidade → Adicionar.
- **Envio Consolidado:** O pedido é enviado ao banco de dados apenas após a conferência da lista.

### 🏭 Módulo da Logística
- **Dashboard Realtime:** Monitoramento de novos pedidos sem necessidade de atualizar a página.
- **Alertas Sonoros e Visuais:** "Sininho" e pop-ups instantâneos para cada novo pedido.
- **Visualização de Detalhes:** Consulta rápida dos itens de cada pedido pendente.
- **Geração de Excel:** Download automático do arquivo formatado para impressão/conferência.
- **Baixa Obrigatória:** Registro do operador que finalizou a separação.

---

## 🛠 Estrutura do Projeto
```
LogiSpeed/
├── src/
│   ├── App.tsx          # Roteamento e Proteção de Acesso
│   ├── main.tsx         # Entry point
│   ├── index.css        # Design System (Dark Premium)
│   ├── lib/
│   │   └── supabase.ts  # Cliente e Conexão com DB
│   ├── pages/
│   │   ├── Login.tsx    # Seleção de Perfil e Nome
│   │   ├── Vendedor.tsx # Interface de Lançamento
│   │   └── Logistica.tsx# Dashboard Realtime
│   └── components/      # Componentes reutilizáveis
└── README.md
```

---

## ⚙️ Instalação e Execução

1. **Instalar dependências:**
   ```bash
   npm install
   ```

2. **Configuração do Ambiente:**
   Certifique-se de que o arquivo `src/lib/supabase.ts` contém as credenciais corretas do seu projeto no Supabase.

3. **Executar em modo desenvolvimento:**
   ```bash
   npm run dev
   ```

---

## 🗄 Esquema do Banco de Dados
O sistema utiliza duas tabelas principais:
- `pedidos`: ID, Vendedor, Setor, Status, Operador e timestamps.
- `itens_pedido`: ID, ID do Pedido, Código do Produto e Quantidade.

---

## 📄 Layout do Excel Gerado
Cada pedido exportado segue o padrão:
1. **Linha 1:** Setor (Mesclado)
2. **Linha 2:** Vendedor (Mesclado)
3. **Linha 3:** Cabeçalho (Código | Quantidade)
4. **Linhas 4+:** Lista de Itens

---

*Desenvolvido para máxima agilidade operacional.*
