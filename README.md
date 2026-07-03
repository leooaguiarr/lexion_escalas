# Lexion Escalas

MVP web para controle de escalas quinzenais de segurança, com Supabase, Next.js, cálculo de horas, pagamentos em dinheiro e geração de PDF via impressão do navegador.

## Stack

- Next.js App Router
- React + TypeScript
- Supabase Auth
- Supabase Postgres
- CSS puro

## Como rodar no VS Code

1. Extraia o projeto.
2. Abra a pasta `lexion-escalas` no VS Code.
3. Crie um projeto no Supabase.
4. Abra o SQL Editor do Supabase e execute o arquivo:

```bash
supabase/schema.sql
```

5. Copie `.env.local.example` para `.env.local`.
6. Preencha:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

7. Instale as dependências:

```bash
npm install
```

8. Rode o projeto:

```bash
npm run dev
```

9. Acesse:

```bash
http://localhost:3000
```

## Primeiro acesso

Na tela de login, use a opção de criar conta. O primeiro usuário cadastrado vira `owner` automaticamente pelo trigger do banco. Os próximos usuários viram `scheduler` por padrão.

Para desenvolvimento local, no Supabase Auth, pode ser útil desativar temporariamente a confirmação de e-mail.

## Fluxo de uso

1. Criar conta e entrar.
2. Cadastrar seguranças.
3. Cadastrar locais.
4. Criar escala quinzenal.
5. Configurar turnos da escala.
6. Preencher disponibilidade.
7. Montar escala manualmente.
8. Gerar PDF da escala.
9. Fechar a quinzena.
10. Gerar e controlar pagamentos em dinheiro.

## Observações importantes

- O PDF da escala não mostra valores de pagamento.
- O relatório de pagamento é interno.
- O sistema permite dobra, mas mostra alerta.
- O sistema permite selecionar segurança indisponível, mas mostra alerta.
- Turnos que viram o dia são calculados corretamente, por exemplo `23:00 até 06:00 = 7h`.
