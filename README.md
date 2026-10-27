# Checkout — Prescrição de Canetas na Prática Médica

Checkout responsivo em português, com preço fixo de **R$ 599,40 à vista**, artes atualizadas, fonte Hotmart Sans e pagamento Pix pela Black Cat.

## Publicar na Vercel

1. Importe o repositório `ronald-almeida/GLP` na Vercel.
2. Selecione o preset **Other**, diretório raiz do repositório e saída **public**. Não é necessário comando de build.
3. Configure `BLACKCAT_API_KEY` nas variáveis de ambiente do servidor, com a chave obtida no painel Black Cat. Não use prefixo público e não coloque a chave em arquivos versionados.
4. Publique. Se configurar a chave depois de publicar, faça um novo deploy.

O projeto usa as funções Node da pasta `api/`. GitHub Pages sozinho não executa essa integração. O repositório contém código, mas não cria automaticamente uma hospedagem.

## Executar localmente

Requer Node.js 22 ou superior.

```sh
npm install
cp .env.example .env.local
# Preencha BLACKCAT_API_KEY em .env.local
npm run dev
```

Abra http://localhost:3000. No PowerShell, use `Copy-Item .env.example .env.local` no lugar de `cp`, se necessário.

## Fluxo

- Validação de nome, email e confirmação, CPF/CNPJ com dígitos verificadores e telefone.
- `POST /api/pix` envia os dados à Black Cat, sempre com `amount: 59940`, um produto digital e pagamento `pix`. O preço informado pelo navegador é ignorado.
- O pop-up apresenta QR Code, código copiável e validade retornada pelo provedor.
- A página reaproveita o mesmo Pix enquanto permanecer aberta. Fechar e reabrir o pop-up não cria outra cobrança.
- O status é consultado com token assinado, a cada 12 segundos enquanto o pop-up está aberto, ou pelo botão “Já paguei”.
- Timeout de criação é tratado como resultado incerto, sem repetição automática da cobrança.

**Sem banco de dados, localStorage, sessionStorage ou cookies de pagamento.** Dados e Pix ficam somente na memória da página. Recarregar ou fechar a página perde esse estado; a cobrança já criada continua existindo na Black Cat. A API de pagamentos mantém os registros necessários ao processamento na conta do vendedor.

Não há mecanismo persistente de idempotência entre recarregamentos ou múltiplas abas. A documentação consultada não especifica suporte a chave de idempotência no endpoint de criação. Não se presume que `externalRef` evite duplicações.

## Entrega do curso

O checkout confirma pagamento, mas **não cadastra alunos, não envia emails nem libera o curso**. Essa entrega deve ser feita pelo vendedor ou por uma integração já existente. `BLACKCAT_POSTBACK_URL` é opcional e permite informar uma URL de webhook já implementada pelo vendedor. Sem essa configuração, a consulta de status do checkout continua funcionando.

## Segurança e operação

- Chave somente no servidor; nenhum segredo no frontend.
- Respostas de pagamento com `Cache-Control: no-store`.
- Validação no cliente e servidor; origem conferida; token assinado para consultas.
- Valor e identidade da transação verificados nas respostas.
- QR Code gerado localmente no servidor a partir do texto Pix; nenhum serviço externo recebe o código para produzir a imagem.
- Para produção com tráfego público, configure limites de requisições na hospedagem/WAF conforme a necessidade. A aplicação não usa armazenamento para rate limiting global.
- A fonte é carregada do CDN oficial da Hotmart, com Arial/Helvetica como alternativas. O rodapé identifica Black Cat, sem alegar proteção da Hotmart.

## Verificação

```sh
npm test
```

Se o ambiente impedir a criação de subprocessos: `node --test --test-isolation=none`.

Testes cobrem validação, preço fixo contra adulteração, chave restrita ao servidor, origem, indisponibilidade, timeout sem repetição e consulta assinada. Verificação visual em desktop e celular, abertura do modal e cópia para clipboard realizadas com provedor simulado exclusivamente no ambiente de desenvolvimento.

**Pendente:** configurar a chave de produção, publicar na hospedagem escolhida e validar uma transação real com a conta Black Cat. Não foram geradas cobranças reais durante o desenvolvimento.

## Referência

[Documentação oficial Black Cat](https://docs.blackcatoficial.com/): `POST /api/sales/create-sale`, `GET /api/sales/{transactionId}/status`, autenticação `X-API-Key`, valores em centavos.

## Artes

As duas artes fornecidas foram editadas com a ferramenta nativa de geração/edição de imagens. Brief aplicado: preservar marca, pessoas e composição; substituir preços, descontos e parcelas por “R$ 599,40” e “à vista no Pix”. Arquivos em `public/assets/banner.webp` e `public/assets/banner-vertical.webp`, com conversão de formato para carregamento rápido. O logo original foi preservado.