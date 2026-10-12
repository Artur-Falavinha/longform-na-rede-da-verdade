# Contribuição e publicação

## Destinos e identidade

- Repositório: https://github.com/Artur-Falavinha/longform-na-rede-da-verdade.
- Branch de integração: `main`.
- Site: https://na-rede-da-verdade.artur-falavinha.workers.dev/.
- Worker: `na-rede-da-verdade`, conta pessoal `2526a86dea7f4ef0caf1d7dc71e681f8`.
- Nunca publicar pela conta Lumicenter. Conferir `gh api user --jq .login` antes de operar o repositório; para publicação local, conferir também `npx wrangler whoami`.
- O PostHog está desativado no workflow. Sua ativação, o aceite editorial, a divulgação oficial e o reinício das métricas exigem indicação específica do responsável.

## Branches e alterações atômicas

Manter o projeto principal em `main`. Criar uma worktree própria para cada mudança, a partir de `origin/main` atualizado. Não trocar branches no mesmo diretório físico durante sessões paralelas. Uma dependência ainda não integrada deve ser explícita antes de empilhar branches.

Uma PR resolve um problema ou entrega uma capacidade coesa. Separar configuração, interface, conteúdo, validação e publicação quando puderem ser revisados e integrados independentemente. Cada commit deve representar uma mudança compreensível; a PR completa deve funcionar e passar nos checks. Não dividir uma dependência essencial entre PRs independentes.

Antes de criar a PR, revisar `git status`, `git diff --cached`, `git diff --cached --check`, `git diff --stat origin/main...HEAD` e `git log origin/main..HEAD`. Adicionar arquivos explicitamente, evitando inclusão indiscriminada de arquivos locais. Conferir também o histórico que será enviado.

## Mensagens e UTF-8

Usar Conventional Commits com descrição em português: `tipo(escopo): descrição`. Exemplos:

- `feat(player): preserva reprodução ao recolher os controles`
- `fix(timeline): corrige alinhamento das datas no celular`
- `test(midia): cobre retorno ao trecho anterior`
- `ci(deploy): verifica a versão publicada`
- `docs(fluxo): documenta revisão e publicação`

Títulos de PR seguem a convenção já adotada, por exemplo `fix(player): [FRONTEND] preserva o foco dos controles`. Usar `[BACKEND]` para publicação e infraestrutura. Vincular uma issue real quando existir; não inventar numeração.

Configurar a identidade pessoal apenas no repositório e preservar UTF-8:

```powershell
git config i18n.commitEncoding utf-8
git config i18n.logOutputEncoding utf-8
git config core.autocrlf false
New-Item -ItemType Directory -Force pr-assets | Out-Null
$message = 'fix(player): preserva reprodução e posição'
[IO.File]::WriteAllText((Join-Path $PWD 'pr-assets/commit.txt'), $message, [Text.UTF8Encoding]::new($false))
git commit -F pr-assets/commit.txt
```

Salvar a descrição multiline da PR da mesma forma e passar `--body-file pr-assets/pr-description.md` ao `gh pr create`. Não montar comandos por concatenação de texto editorial. Conferir os textos locais e os retornados por `gh pr view` para detectar acentuação corrompida. `.gitattributes` normaliza os arquivos textuais para LF e mantém mídia binária.

Datas, autoria, resultados e evidências devem corresponder ao trabalho realizado. Mensagens descrevem problema, comportamento e validação; não precisam de assinaturas promocionais ou comentários sobre ferramentas.

## Validação e revisão

Usar Node.js 24 e `npm ci`. Para código, executar os checks relevantes ao escopo:

```powershell
npm run check
npm test
npm run build
npm run validate:content
npm run validate:assets
npx wrangler deploy --dry-run
```

Para testes de navegador, instalar Chromium com `npx playwright install chromium`, iniciar `npm run dev` e executar `npm run test:e2e -- --project=desktop --project=mobile`. O servidor padrão é `http://127.0.0.1:4325`; usar `TEST_URL` quando estiver em outra porta. No CI, Playwright inicia e encerra seu próprio servidor.

Mudanças visuais ou de mídia também precisam de revisão no navegador: direção 04, teclado, movimento reduzido, scroll reverso, timeline, áudio contínuo e transições interrompidas. Build aprovado não substitui revisão visual. Alterações apenas documentais pedem revisão de links, comandos, UTF-8 e coerência com a configuração real; o workflow remoto continua executando a validação completa.

Usar o template em `.github/pull_request_template.md`. Registrar o que foi efetivamente testado e as limitações restantes. Salvar capturas em `pr-assets/screenshots/`, sem segredos, mantendo-as locais. Não declarar aceite editorial nem teste em aparelho físico sem evidência.

## Merge e deploy automático

O workflow `.github/workflows/ci.yml` roda em PRs para `main`, pushes para `main` e disparos manuais. O job **Validar aplicação** instala dependências, verifica tipos e testes unitários, gera o build, valida conteúdo e ativos, faz dry-run e executa Playwright desktop/mobile.

A proteção da `main` exige **Validar aplicação** com branch atualizada, bloqueia force push e exclusão. A configuração atual não exige aprovação de outro revisor e não aplica as regras a administradores; isso não substitui a revisão antes do merge. Preservar os commits usando merge commit, sem squash ou rebase. Não fazer merge de checks pendentes ou falhos, nem usar bypass administrativo como rotina. Operações externas devem estar autorizadas no escopo da tarefa.

Somente após validação bem-sucedida, um push na `main` dispara **Publicar na Cloudflare**. PRs não recebem o token de publicação. O job de deploy:

1. Gera novamente o build do mesmo commit e grava seu SHA em `dist/release.json`.
2. Confere se o commit ainda é a ponta da `main` e ignora revisões substituídas.
3. Serializa publicações e executa `wrangler deploy` na conta pessoal.
4. Confere o SHA servido, a página, o PDF e respostas HTTP 206 com bytes de áudio e vídeo corretos.

O token fica exclusivamente no secret de repositório `CLOUDFLARE_API_TOKEN`. Suas permissões são **Workers Scripts: Edit** e **Account Settings: Read**, restritas à conta pessoal. O token atual não tem expiração configurada. Não registrar seu valor em Git, descrições, logs, capturas ou arquivos de contexto. A edição de Workers é uma permissão da conta, não exclusiva deste Worker.

Falhas de validação bloqueiam a publicação. Falha antes do upload preserva a versão anterior; falha na verificação posterior pode ocorrer com a nova versão já publicada. Inspecionar a etapa e a versão efetivamente servida antes de decidir por rollback. O workflow não executa rollback automático. Quando apenas uma credencial ausente tiver sido corrigida, é possível reexecutar os jobs falhos pelo GitHub Actions ou `gh run rerun <id> --failed --repo Artur-Falavinha/longform-na-rede-da-verdade`.

## Arquivos locais e encerramento

Não versionar `.specify/`, `specs/`, `.agents/`, `pr-assets/`, `.playwright-mcp/`, `.codex-pr-clean/`, `analise/`, `docs/superpowers/`, `tmp/`, ambientes privados, caches, dependências ou segredos. O inventário operacional em `validation/content-inventory.json` é versionado porque os validadores precisam dele em um clone limpo; os documentos de contexto continuam locais.

Depois do merge, atualizar o hub com `git pull --ff-only` apenas com árvore limpa. Antes de remover uma worktree, confirmar caminho absoluto, ausência de alterações únicas, inclusão dos commits na `main` e encerramento dos processos próprios. Copiar ou arquivar as evidências no hub e verificar sua integridade antes da remoção. Remover apenas diretórios identificados da tarefa; nunca apagar `tmp/` ou documentos de contexto em bloco.
