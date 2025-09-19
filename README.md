# wachatbot
## ChatBot para o WhatsApp

## Atualização do S.O

-- ajustar o timezone

`$ sudo timedatectl set-timezone America/Sao_Paulo`

`$ sudo apt update`

`$ sudo apt upgrade`

`$ sudo apt-get install gconf-service libasound2 libatk1.0-0 libatk-bridge2.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 libnss3-dev lsb-release xdg-utils wget libgbm-dev`

## Instalação Node.js

`$ sudo curl -sL https://deb.nodesource.com/setup_14.x | sudo bash -`

`$ sudo apt install nodejs`

## Host Lydia

-- Editar arquivo hosts colocando a linha:

`192.168.1.169 execute.lydia.com.br execute`

## Instalação do bot

* logar com o usuário **ubuntu**

`$ cd /home/lydians`

`$ git clone https://github.com/Lydia-Sistemas/wachatbot.git wachatbot999`

`$ cd wachatbot999`

`$ npm install`

`$ npm update`

## Configuração do Bot

* Definir qual porta o bot vai rodar
    * rode o comando abaixo
        * `$ ss -tunlp | grep node`
        * pegue o número da maior porta listada e acrescente 1, verifique se não há outro serviço usando a porta selecionada

* Criar o arquivo config.ini
    * `$ cp config.ini.tpl config.ini`
    * Ajustar os parametros do config.ini
        * port
        * responseUrl
        * responseHostname
        * responsePath

## Instalação do serviço no systemd

* `$ sudo cp etc/systemd/system/lydia.wachatbot.service /etc/systemd/system/lydia.wachatbot999.service`
    * ajuste os seguintes parametros no serviço
        * ExecStart (o local onde o bot foi instalado e o id)
        * SyslogIdentifier (coloque nesse padrão: lydia-wachatbot999 - onde 999 é o id do bot)

* habilitar o serviço:
    * `$ sudo systemctl daemon-reload`
    * `$ sudo systemctl enable lydia.wachatbot999`
    * `$ sudo systemctl start lydia.wachatbot999`
        * onde 999 é o id do bot

## Execução com Docker

Um ambiente Docker está disponível na pasta `docker/` para facilitar a criação de contêineres do bot.

1. Crie o arquivo de configuração copiando o template:

    ```bash
    mkdir -p config
    cp config.ini.tpl config/config.ini
    ```

    Ajuste as chaves `port`, `responseUrl`, `responseHostname` e `responsePath` conforme o ambiente.

2. Opcionalmente ajuste o identificador do bot no `docker/docker-compose.yml` alterando a variável `BOT_ID`.

3. No diretório `docker/`, construa a imagem e suba o serviço:

    ```bash
    cd docker
    docker compose build
    docker compose up -d
    ```

    O arquivo `docker-compose.yml` usa o repositório como contexto de build (`context: ..`).
    Para reconstruir manualmente a imagem com o mesmo contexto, execute a partir da raiz do projeto:

    ```bash
    docker build -f docker/Dockerfile .
    ```

Os diretórios `volumes/cache` e `volumes/cachew` são montados como volumes para persistir a sessão do WhatsApp entre reinicializações do contêiner, e o `config/config.ini` é montado como somente leitura dentro da imagem.
