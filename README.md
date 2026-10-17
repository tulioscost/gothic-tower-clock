# Relógio da Torre Gótica — Foundry VTT v14.369

Módulo **sem dependências adicionais** que coloca um relógio gótico animado na parte superior, **à esquerda da barra lateral do Foundry (chat)**. Inclui a imagem da torre e a gravação de sino fornecidas para o projeto.

## Funções

- Relógio analógico com horas, minutos e segundos; mostrador e data numéricos.
- GM define data/hora, pausa/retoma o relógio e escolhe o multiplicador de velocidade (**0,01× a 3600×**).
- Botões do GM para avançar 1 minuto, 1 hora ou 1 dia.
- Badalada **às 12:00 (meio-dia) e 00:00 (meia-noite)**, inclusive se o tempo acelerado ultrapassar o instante entre atualizações; o arquivo completo do sino é reproduzido para os usuários conectados.
- Sincronização com os jogadores pelo socket nativo do Foundry. O relógio continua baseado no estado persistido do mundo e o GM ativo transmite correções a cada 8 segundos.
- Cada usuário pode silenciar o sino e ajustar a largura no menu **Configuração do jogo → Configurar módulos**; é possível arrastar a torre para outro lugar e reencaixá-la ao chat.
- Controles de alteração do horário restritos ao GM; não altera o `game.time.worldTime` de outros sistemas.
- O GM pode testar o sino manualmente e alterar seu volume.

## Instalação (ZIP local)

1. Pare o mundo no Foundry VTT.
2. Extraia o ZIP, preservando exatamente a pasta `gothic-tower-clock`.
3. Coloque a pasta em `{User Data}/Data/modules/`. O arquivo deve existir em `Data/modules/gothic-tower-clock/module.json`.
4. Abra o mundo, acesse **Configuração do jogo → Gerenciar módulos** e ative **Relógio da Torre Gótica**.
5. O primeiro GM ativo inicializa o calendário com a data e a hora local daquele GM. Em seguida, use o ícone de engrenagem na torre para personalizar.

**Para publicar no GitHub:** faça upload dos arquivos de dentro da pasta para um repositório e crie um release ZIP contendo a pasta `gothic-tower-clock/`. A instalação por URL requer hospedar `module.json` e um `download` de release público, com URLs adicionadas ao manifesto; não foram inventadas URLs neste pacote.

## Como usar

- Engrenagem ao lado do relógio: painel de controle do GM.
- Salvar alterações: modifica o tempo de todo o mundo e sincroniza clientes.
- Botões `+1 min`, `+1 h`, `+1 dia`: avançam o mundo imediatamente; se cruzarem 12:00 ou 00:00, disparam o sino.
- Sino: toca de forma sincronizada quando o tempo avança; **um toque a cada 12 horas fictícias**. Em velocidades extremas, impede a sobreposição de gravações de 22 segundos e pode omitir toques consecutivos.
- Ícone de volume: silencia **somente o próprio usuário**, sem desativar o sino no mundo.
- Arraste `TORRE DO TEMPO` para mover. Botão de encaixe restaura posição padrão ao lado do chat.

## API para macros (opcional)

```js
// Horário do mundo em milissegundos (UTC fictício)
const api = game.modules.get("gothic-tower-clock").api;
console.log(new Date(api.getTime()).toISOString());

// Ação reservada ao GM: avançar 24 horas (não emite badalada automática por essa API)
await api.setTime(api.getTime() + 86400000);
```

## Observações técnicas

- Compatibilidade **direcionada ao Foundry VTT 14 (build 369)**; sintaxe JS, cálculos e integridade do pacote podem ser testados sem iniciar o Foundry. É necessário testar a integração visual no seu mundo e demais módulos ativos.
- Usa o `foundry.audio.AudioHelper.play` da API v14 e socket do módulo `module.gothic-tower-clock`.
- Usa calendário fictício baseado em UTC, independente de fuso horário, horário de verão ou calendário customizado do sistema.
- Por escolha de interoperabilidade, mantém seu próprio tempo e não modifica o horário interno do Foundry nem os calendários de outros módulos.
- A imagem e o áudio foram fornecidos pelo solicitante; para publicação pública, confirme as respectivas permissões/licenças.
- Ao entrar em um mundo sem nenhum GM conectado, os jogadores visualizam o tempo projetado a partir da última configuração persistida, mas nenhuma nova badalada é originada até haver GM ativo.

## Estrutura

```text
gothic-tower-clock/
├── module.json
├── scripts/
│   ├── clock-core.mjs
│   └── main.mjs
├── styles/
│   └── clock.css
├── assets/
│   ├── tower.png
│   └── bell.mp3
├── lang/
│   └── pt-BR.json
├── tests/
│   └── clock-core.test.mjs
└── README.md
```
