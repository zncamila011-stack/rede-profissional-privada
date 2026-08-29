# Backend — Rede Profissional Privada

API simples em Node.js/Express para receber e gerenciar as solicitações de acesso do formulário da landing page.

## O que ele faz

- `POST /api/access-requests` — recebe uma nova solicitação (nome, e-mail, LinkedIn, tipo: profissional/empresa). Valida os dados, evita e-mails duplicados e tem limite básico contra spam.
- `GET /api/access-requests` — lista todas as solicitações (protegido por token de admin). Aceita filtros `?role=` e `?status=`.
- `PATCH /api/access-requests/:id` — aprova ou recusa uma solicitação.
- `GET /api/access-requests/export.csv` — exporta tudo em CSV.
- `GET /api/health` — checagem simples de que o servidor está no ar.

Os dados ficam salvos em `data/access-requests.json` — não é um banco de dados de verdade, mas funciona bem para uma primeira versão com volume baixo/médio.

## Como rodar localmente

```bash
cd backend
npm install
ADMIN_TOKEN=escolha-um-token-forte node server.js
```

O servidor sobe em `http://localhost:3001`.

## Conectando com a landing page

No arquivo `index.html` da landing page, defina a variável `API_BASE_URL` no início do `<script>` para o endereço onde essa API estiver rodando:

```js
const API_BASE_URL = "http://localhost:3001"; // ou a URL do seu servidor em produção
```

## Painel de administração

Abra `admin.html` no navegador, informe a URL da API e o `ADMIN_TOKEN` que você definiu — ele mostra a lista de solicitações, permite aprovar/recusar e exportar CSV.

**Atenção:** o token fica visível no navegador de quem usa o painel. Para algo mais robusto no futuro, vale trocar por um login de verdade (usuário/senha com sessão).

## Colocando no ar (deploy)

Esse backend é um servidor Node simples, então funciona em qualquer serviço que rode Node.js. Opções fáceis e com camada gratuita:

1. **Render** (render.com) — conecte o repositório, defina `ADMIN_TOKEN` nas variáveis de ambiente, comando de start `node server.js`.
2. **Railway** (railway.app) — mesma ideia, deploy direto do repositório.
3. **Fly.io** — para quem quer mais controle sobre a infraestrutura.

Depois do deploy, pegue a URL pública gerada (ex.: `https://sua-api.onrender.com`) e coloque em `API_BASE_URL` na landing page.

**Importante sobre os dados:** em serviços com sistema de arquivos temporário (efêmero), o arquivo `data/access-requests.json` pode ser apagado a cada novo deploy. Para produção séria, o ideal é trocar o armazenamento em arquivo por um banco de dados de verdade (Postgres, MongoDB, etc.) — posso ajudar a fazer essa migração quando for a hora.

## Notificação por e-mail (Gmail)

Toda vez que alguém preenche o formulário, o backend pode te avisar automaticamente por e-mail, usando sua própria conta do Gmail para enviar.

### 1. Gerar uma senha de app do Google

O Gmail não permite usar sua senha normal para isso — você precisa de uma "senha de app":

1. Ative a verificação em duas etapas na sua conta Google, se ainda não tiver: https://myaccount.google.com/security
2. Acesse https://myaccount.google.com/apppasswords
3. Crie uma nova senha de app (pode chamar de "Rede Profissional Privada")
4. Copie a senha gerada (16 caracteres) — você vai usá-la uma única vez

### 2. Configurar as variáveis de ambiente

No Render (ou onde for hospedar), adicione:

| Variável | Exemplo | Descrição |
|---|---|---|
| `GMAIL_USER` | `voce@gmail.com` | A conta Gmail que vai enviar os avisos |
| `GMAIL_APP_PASSWORD` | `abcd efgh ijkl mnop` | A senha de app gerada no passo anterior |
| `NOTIFY_EMAIL` | `voce@gmail.com` | Para onde o aviso vai (pode ser a mesma conta ou outra) |

Se `GMAIL_USER` e `GMAIL_APP_PASSWORD` não forem definidos, o backend simplesmente não envia e-mails — o formulário continua funcionando normalmente, só sem o aviso.

**Importante:** nunca coloque essas credenciais direto no código nem no GitHub — sempre como variável de ambiente no serviço de hospedagem.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3001` | Porta em que o servidor escuta |
| `ADMIN_TOKEN` | `troque-este-token` | Token usado para acessar as rotas de admin — troque antes de publicar |
| `GMAIL_USER` | — | Conta Gmail usada para enviar as notificações |
| `GMAIL_APP_PASSWORD` | — | Senha de app do Gmail (não é a senha normal da conta) |
| `NOTIFY_EMAIL` | valor de `GMAIL_USER` | E-mail que recebe o aviso de cada nova solicitação |
