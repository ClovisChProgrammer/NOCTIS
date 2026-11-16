# NOCTIS - Andamentos KAI

## Estado atual (2026-11-16)
- **Frente ativa:** `noctis-engine` (web, Vite + TypeScript + WebGL2). Build `npm run build` OK.
- **Implementado no engine:** HUD/painel com alvo (estrela/planeta), sistema, nº de planetas e órbita visual; mira fixa/retículo, seleção por mira/clique e **hover** (mouse livre ou crosshair) com destaque "Sob mira"; navegação assistida `G`; teclas `F/X/Esc/[/]/N/P/]/Backspace/,/./J/K/Enter` para seleção/histórico/ciclo.
- **Catálogo aplicado no render:** `src/galaxy/catalog.ts` com classes S0–S11 e tipos T0–T10 do original; estrelas com cor/tamanho por classe inferida, planetas com **cor, tamanho e disco (núcleo+halo)** por tipo inferido (T0–T9), descrições de classe/tipo no painel. Pick refinado com prioridade a planetas do sistema atual.
- **Dados runtime:** `public/data/STARMAP.BIN` e `public/data/GUIDE.BIN` (72.728 registros).
- **OFFSETS.MAP/GLOBES.MAP estudados:** `ESTUDO_OFFSETS_GLOBES.md` (OFFSETS 7340 B: offsets/projeção para `globe/background`; GLOBES 22586 B: textura/mapa de globo para `globe/glowinglobe` e buffer em NOCTIS-1; usados via `n_offsets_map/n_globes_map`, `om_bytes/gl_bytes/gl_brest`). Integração direta no engine web pendente (requer portar formato/paleta ou pipeline de textura).
- **Render atual:** pontos/sprites + overlays/discos (sem malhas/texturas 3D). Escala visual, não 1:1.

## Próximos passos propostos
1. Lista/índice de sistemas/objetos com busca por nome/id para navegação rápida.
2. Refinar inferência de classe/tipo (aproximar regras do original) e/ou usar metadados adicionais se viável.
3. Protótipo de aparência de globo/textura usando achados de `GLOBES.MAP` (paleta/atlas) ou sprites maiores.
4. Otimizar render/input para hardware modesto (Latitude E7450).

## Notas
- Referência: `Noctis-IV-Plus-master`. Docs: `CATALOGO_TIPOS_NOCTIS.md`, `ESTUDO_OFFSETS_GLOBES.md`.
- Teste: `cd D:\Extensão\NOCTIS\noctis-engine; npm run dev`. Build: `npm run build`.

## Notas
- Referência de comportamento/algoritmos: `Noctis-IV-Plus-master`.
- Teste manual: `cd D:\Extensão\NOCTIS\noctis-engine; npm run dev`. Build: `npm run build`.
