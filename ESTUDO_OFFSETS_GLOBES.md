# Estudo OFFSETS.MAP e GLOBES.MAP (Noctis IV / NIV+ original)

Arquivos (originais): `Noctis-IV-Plus-master/source/OFFSETS.MAP` (7340 bytes) e `Noctis-IV-Plus-master/source/GLOBES.MAP` (22586 bytes).

## Carregamento e buffers (código original)
- Declaração/uso: `NOCTIS-0.CPP` (`unsigned char far *n_offsets_map; char far *n_globes_map;`), alocados em `NOCTIS.CPP`:
  - `n_offsets_map = farmalloc(om_bytes);`
  - `n_globes_map  = farmalloc((unsigned)gl_bytes + (unsigned)gl_brest);`
  - `digimap2 = (unsigned long far *) &n_globes_map[gl_bytes];` (alias/fonte sobre área estendida; comentário: extensão de ~10182 bytes / `gl_brest` após `gl_bytes`).
- Leitura em `NOCTIS-0.CPP`: `sa_open(offsets_map)` → `_read(..., n_offsets_map, om_bytes)`; `sa_open(globes_map)` → `_read(..., n_globes_map, gl_bytes)`.
- Constantes literais `om_bytes/gl_bytes/gl_brest` não localizadas como `#define` nos fontes greppados (podem vir de includes/ambiente não presente), mas tamanhos em disco observados: 7340 e 22586.

## Uso no render original
- **OFFSETS.MAP (`n_offsets_map`)**: passado como mapa de offsets/endereçamento para rotinas de desenho de fundo/globo.
  - `background(start, target, background_tex, n_offsets_map, total_map_bytes, screenshift)` em `NOCTIS-0.CPP` (~2695-2725): percorre mapa (words), valores especiais altos (ex.: compara com 64000 / byte 100 em `globe`) funcionam como marcadores/blank; usa offsets para indexar pixels no alvo/background (efeito tipo QuickTime VR / panorama projetado).
  - `globe(..., tapestry, offsetsmap=n_offsets_map, total_map_bytes, ...)` (~3043+): usa `offsetsmap` (lido via `[si]`) para posicionar texels da `tapestry` (textura/superfície) na projeção do globo com escala por distância (`mag_factor`, gman 1x1..4x4) e cor/saturação.
- **GLOBES.MAP (`n_globes_map`)**: usado como textura/dados de globo e área de trabalho.
  - `globe(gl_start, ..., n_globes_map, gl_bytes, ...)` e `glowinglobe(..., n_globes_map, gl_bytes, ...)` para render de corpos (planetas/estrelas) em diferentes distâncias/modos (iluminado/terminador, “glowing”).
  - Em `NOCTIS-1.CPP` `n_globes_map` é manipulado como buffer de textura/índices (`txtr = n_globes_map`, escritas/leituras indexadas, preenchimentos) para superfícies/efeitos procedurais.

## Estrutura inferida (inspeção binária)
- **OFFSETS.MAP** (7340 B): sequência densa de valores 16-bit little-endian (ex. iniciais `DF FD, 2C 09, ...`) interpretáveis como offsets/índices de tela/mapa com sentinelas (bytes/words altos) consumidos pelos loops ASM das rotinas `globe/background`.
- **GLOBES.MAP** (22586 B): dados byte a byte com padrões repetitivos e valores típicos de índices/paleta e marcadores (ex. `64` frequente como “vazio/blank” em trechos iniciais); usado como mapa de globo/texel para `globe/glowinglobe` e como base mutável em `NOCTIS-1.CPP`.

## Relevância para `noctis-engine` (web)
- O engine atual usa WebGL2 com pontos/sprites e não possui pipeline de textura/projeção de globo do original; **não há integração direta** ainda.
- Para aproximar o visual original: seria preciso (1) portar/interpretar o formato exato consumido por `globe/glowinglobe/background` (depende de `om_bytes/gl_bytes` e convenções de textura/paleta), (2) gerar ou amostrar texturas de “globo” para discos/planetas, ou (3) usar `GLOBES.MAP` como atlas/indexado conforme paleta original. Isso é trabalho de paridade gráfica não trivial; estudo atual documenta papel e pontos de integração.
- `OFFSETS.MAP` parece mais ligado a composição/background/projeção de tela do que a metadados de tipos; `GLOBES.MAP` é o candidato principal para aparência de superfície/globo dos corpos.
