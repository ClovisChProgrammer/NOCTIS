# noctis-engine

Motor web (TypeScript + Vite + WebGL2) para a nossa versão do NOCTIS IV.

## Requisitos
- Node.js + npm

## Rodar
```bash
npm install
npm run dev
```
Build de produção: `npm run build` (saída em `dist/`).

## Controles atuais
- Clique no canvas: capturar mouse (pointer lock). Com mouse capturado, **clique mirando a cruz** para selecionar estrela ou planeta sob a mira.
- Mouse: olhar (capturado) ou **hover** sobre objetos (não capturado) com destaque e info "Sob mira" no painel.
- `WASD`: mover, `Shift`: turbo, `Space`/`C`: subir/descer
- `F`: fixar estrela mais próxima como **ALVO FIXADO**
- `X` ou `Esc`: soltar alvo (volta ao modo automático "mais próximo")
- `[` / `P`: estrela anterior; `N`: próxima estrela (navega e fixa)
- `]` / `Backspace`: voltar seleção anterior (histórico); se não houver, solta o alvo
- `,` / `.` (ou `J`/`K`): selecionar planeta anterior/próximo do sistema atual (fixa no planeta)
- `Enter`: focar estrela do sistema atual
- `G` (segurar): iniciar/cancelar **viagem automática** ao alvo atual (gira e encara o alvo; funciona entre estrelas e dentro do sistema)

## Renderização (estado atual)
- Estrelas: pontos com cor/tamanho por classe inferida do catálogo do original (`src/galaxy/catalog.ts`, ver `CATALOGO_TIPOS_NOCTIS.md`).
- Sistema alvo: sol e planetas com **cor, tamanho e disco** por tipo planetário (catálogo T0–T9 inferido), núcleo+halo, órbitas em escala visual exagerada; destaque de seleção e **hover**. Painel mostra classe/tipo, descrição do catálogo, órbita visual e alvo sob a mira.
- Pick refinado: prioridade a planetas do sistema atual sobre estrelas em sobreposição. Sem malhas/texturas 3D.

## Dados
- `public/data/STARMAP.BIN` e `public/data/GUIDE.BIN` (carregados em runtime).

## Estrutura
- `src/galaxy/*`: parsing, construção e posicionamento da galáxia
- `src/render/*`: matemática e renderização (starfield)
- `src/main.ts`: loop principal, câmera e HUD

## Validação
- `npm run build` deve passar (`tsc && vite build`).
- Scripts em `scripts/` (`verify-galaxy.ts`, `check-placement.ts`, `validate-render.cjs`) para verificações específicas.

