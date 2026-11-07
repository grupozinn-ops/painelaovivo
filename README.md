# Painel de vendas ao vivo (Bling)

Painel escuro, feito pra TV, notebook e celular, que puxa os pedidos de venda do Bling (API v3), **soma até 5 contas do Bling (uma por empresa)** e mostra:

- **Vendido hoje** em número grande, com pedidos, ticket médio, comparação com ontem no mesmo horário e previsão do dia
- **Por empresa**: quanto cada empresa vendeu hoje e no mês (aparece quando há mais de uma conta)
- **Vendido no mês**, **projeção do mês** (com meta opcional), **ticket médio** e **pedidos no mês**
- **Ritmo de hoje**: vendas acumuladas por hora, hoje x ontem
- **Canais que mais vendem** (mês ou hoje), com a logo de cada marketplace
- **Vendas por dia** do mês, com a projeção dos dias que faltam
- **Últimas vendas**, com aviso na tela (e som, se ligar o sininho) a cada venda nova

Atualiza sozinho a cada 30 segundos. O servidor consulta o Bling no máximo a cada 40 segundos, respeitando o limite de 3 requisições por segundo da API.

---

## Como colocar no ar (Vercel + Upstash, uns 20 minutos)

### 1. Criar o aplicativo no Bling

1. No Bling, entre em **Central de Extensões > Área do Integrador** e crie um aplicativo novo (uso próprio/privado).
2. Em **Link de redirecionamento**, coloque: `https://SEU-PROJETO.vercel.app/api/auth/callback`
   (você ajusta depois que souber o endereço final da Vercel).
3. Marque os escopos de **leitura** de: **Pedidos de Venda**, **Canais de Venda**, **Situações** e, se aparecer, **Dados da empresa** (o painel usa a razão social e o CNPJ pra mostrar o nome e impedir que a mesma empresa entre duas vezes na soma).
4. Salve e copie o **Client ID** e o **Client Secret**.

### 2. Subir o código na Vercel

1. Crie um repositório no GitHub com esta pasta e importe na Vercel (**Add New > Project**). Não precisa configurar build: é só importar.
2. Ou, pelo terminal, dentro da pasta: `npx vercel` e siga as perguntas.

### 3. Ligar o banco (Upstash Redis)

O painel guarda o token do Bling e os números já calculados num Redis.
Na Vercel, abra o projeto > **Storage** (ou **Marketplace**) > **Upstash for Redis** > crie e conecte ao projeto. As variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` entram sozinhas.
(Se preferir criar direto em upstash.com, copie a REST URL e o token para `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.)

### 4. Variáveis de ambiente

Em **Settings > Environment Variables**:

| Variável | O que é |
|---|---|
| `BLING_CLIENT_ID` | Client ID do app do Bling (empresa 1) |
| `BLING_CLIENT_SECRET` | Client Secret do app do Bling (empresa 1) |
| `BLING_CLIENT_ID_2` | Client ID do app criado no Bling da empresa 2 |
| `BLING_CLIENT_SECRET_2` | Client Secret do app da empresa 2 |
| `PAINEL_SENHA` | Senha pra abrir o painel (escolha uma forte) |
| `NOME_PAINEL` | Nome no topo, ex.: `Zinn Ecom` |
| `META_MES` | Opcional. Meta do mês em reais, ex.: `500000` |
| `CAMPO_VALOR` | Opcional. `totalProdutos` (padrão) ou `total`. Veja "Como os números são calculados" |
| `AGRUPAR_CANAIS` | Opcional. `marketplace` (padrão: Mercado Livre das duas empresas numa linha só) ou `loja` (uma linha por loja do Bling) |
| `SITUACOES_IGNORAR` | Opcional. IDs extras de situação que não devem contar, separados por vírgula |

Depois de salvar, faça **Redeploy**.

### 5. Conectar o Bling

1. Abra `https://SEU-PROJETO.vercel.app`, digite a senha.
2. Clique em **Conectar Bling**, entre na sua conta e autorize.
3. Na primeira vez o painel lê o mês inteiro (leva alguns segundos). Depois disso é ao vivo.

O acesso fica salvo. O Bling renova o token sozinho enquanto o painel estiver sendo usado. Se ficar mais de 30 dias sem nenhuma consulta, aparece o botão pra conectar de novo.

### 6. Juntar a segunda empresa (outra conta do Bling)

1. Entre no Bling da **segunda empresa** e crie um app igual ao do passo 1 (mesmo link de redirecionamento, mesmos escopos). O Bling trata app privado como "só da própria conta", então cada empresa tem o seu.
2. Na Vercel, cadastre `BLING_CLIENT_ID_2` e `BLING_CLIENT_SECRET_2` com os dados desse segundo app e faça **Redeploy**.
3. **Saia do Bling** neste navegador (ou abra o painel numa janela anônima) e entre com o login da segunda empresa. Isso é importante: a autorização vale pra conta que estiver logada no Bling.
4. No painel, clique no botão de contas (ícone de prédio, no topo) e em **Conectar outra conta**.

Pronto: todos os números passam a somar as duas empresas, e aparece o bloco **Por empresa** ao lado do vendido hoje.
Se a mesma empresa for autorizada duas vezes, o painel recusa (pra não contar as vendas em dobro).
Na mesma tela de contas dá pra mudar o nome que aparece no painel, reconectar ou remover uma conta. Para uma terceira empresa, repita com `BLING_CLIENT_ID_3` e `BLING_CLIENT_SECRET_3`.

### 7. Deixar rodando mesmo com o painel fechado (recomendado)

Crie uma tarefa grátis no [cron-job.org](https://cron-job.org) chamando a cada **2 minutos**:

```
https://SEU-PROJETO.vercel.app/api/sync?k=SUA_SENHA
```

Isso registra a hora de cada pedido mesmo de madrugada (o gráfico de ritmo e a previsão ficam mais precisos) e o painel já abre atualizado.

---

## Abrir no celular e na TV

- **Link direto com senha**: `https://SEU-PROJETO.vercel.app/?k=SUA_SENHA`. A senha fica salva no aparelho e some da barra de endereço.
- **Celular**: abra o link no Safari ou Chrome e use **Adicionar à tela inicial**. Vira um app com ícone, em tela cheia.
- **TV**: abra o link no navegador da TV (ou num notebook/mini PC ligado nela) e clique no botão de tela cheia. Em TV Full HD tudo cabe numa tela só, sem rolar. O painel pede pra tela não apagar.
- **Som**: o sininho no topo liga um "plim" a cada venda nova (o navegador só deixa tocar som depois de um clique na página).

## Logos dos marketplaces

Coloque os arquivos oficiais em `public/logos/` com os nomes listados em `public/logos/LEIA-ME.txt` (ex.: `mercadolivre.png`, `shopee.png`) e faça o deploy de novo. Enquanto um arquivo não existir, aparece a sigla do canal na cor dele.

---

## Como os números são calculados

- **Faturamento**: soma dos pedidos de venda do Bling com data do dia, **sem os cancelados** (situação "Cancelado" e qualquer situação personalizada herdada dela).
- **Valor de cada pedido**: por padrão é o **valor dos produtos** (`totalProdutos`), sem frete, igual às "vendas brutas" do Mercado Livre. Atenção: em lojas com cupom ou desconto lançado no pedido, o valor pago pelo cliente é menor. Exemplo real da sua conta: pedido com produtos de R$ 260,00, desconto de R$ 85,10 e R$ 174,90 pagos. Pra contar o valor pago (com frete e descontos), use `CAMPO_VALOR=total`.
- **Ticket médio**: faturamento ÷ número de pedidos.
- **Projeção do mês**: dias já fechados + previsão de hoje + média diária do mês × dias que faltam.
- **Previsão de hoje**: junta o ritmo de hoje com a média do mês, usando a curva de vendas por hora da sua loja (depois de 3 dias monitorados; antes disso usa uma curva padrão de marketplace).
- **Hora da venda**: a API do Bling não informa a hora do pedido, só a data. O painel registra a hora em que viu o pedido pela primeira vez (com o cron de 2 em 2 minutos, a diferença é de 1 a 2 minutos).
- **Canais**: o marketplace é reconhecido pelo nome do canal no Bling. Por padrão, o mesmo marketplace das duas empresas vira uma linha só (ex.: Mercado Livre = soma das duas contas). Com `AGRUPAR_CANAIS=loja`, cada loja do Bling tem a sua linha. Pedidos sem loja aparecem como "Venda direta".
- **Várias empresas**: cada conta é lida separada (com as situações e canais dela) e o painel soma tudo. Se uma conta perder o acesso, as outras continuam atualizando e aparece um aviso com o botão pra reconectar.

## Rodar no seu computador

- **Demonstração com dados de mentira** (não toca no Bling): `npm run demo` e abra `http://localhost:3000/?k=demo`, clique em Conectar Bling e depois, no botão de contas, em Conectar outra conta (a demonstração tem duas empresas).
- **Com o seu Bling**: copie `.env.example` para `.env`, preencha, rode `npm start`. Cadastre no app do Bling o link `http://localhost:3000/api/auth/callback`.

Precisa de Node 18 ou mais novo. Não tem nenhuma dependência pra instalar.

## Outros servidores

O `server.js` roda em qualquer lugar com Node (VPS, Render, Railway, um PC no escritório). Sem Redis configurado, ele guarda os dados em `.data/store.json`.
Observação: o plano gratuito (Hobby) da Vercel é para uso pessoal; para uso comercial a Vercel pede o plano Pro.

## Arquivos

```
api/dashboard.js      dados do painel (consulta o Bling se estiver velho)
api/sync.js           para o cron externo
api/contas.js         lista, renomeia e remove contas do Bling
api/auth/login.js     abre a autorização do Bling (?conta=2 para a segunda empresa)
api/auth/callback.js  recebe o retorno do Bling, confere a empresa e salva o token
lib/bling.js          cliente da API v3 (OAuth, renovação, limite de 3 req/s)
lib/sync.js           busca pedidos, agrega por dia/canal e calcula projeção
lib/contas.js         contas conectadas e nome curto de cada empresa
lib/canais.js         reconhece o marketplace pelo nome do canal
lib/store.js          Upstash Redis ou arquivo local
public/               o painel (HTML, CSS, JS, fontes, ícones, logos)
mock/                 Bling de mentira para a demonstração
```
