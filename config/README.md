# Configuração do chatbot

Copie o arquivo `config.ini.tpl` existente na raiz do projeto para este diretório e renomeie para `config.ini`:

```bash
cp ../config.ini.tpl config.ini
```

Em seguida ajuste os parâmetros `port`, `responseUrl`, `responseHostname` e `responsePath` conforme o ambiente onde o contêiner será executado.

> **Dica:** caso este arquivo não exista, o entrypoint do contêiner copiará automaticamente
> o `config.ini.tpl` padrão que acompanha a imagem. Manter um `config.ini` nesta pasta,
> entretanto, facilita a personalização das variáveis para cada instância.
