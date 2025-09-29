# Sistema de Lista de Compras com Microsserviços
Projeto prático da disciplina de Laboratório de Desenvolvimento de Aplicações Móveis e Distribuídas, que implementa um sistema distribuído para gerenciamento de listas de compras utilizando arquitetura de microsserviços.

## 📖 Descrição
Este projeto demonstra a construção de uma aplicação back-end seguindo os princípios da arquitetura de microsserviços. O sistema é composto por serviços independentes, cada um com sua própria responsabilidade e banco de dados, que se comunicam através de um API Gateway central. A aplicação permite que usuários se cadastrem, criem listas de compras e adicionem itens de um catálogo predefinido a elas.

## ✨ Funcionalidades

* Gerenciamento de Usuários: Cadastro e autenticação com Tokens JWT.

* Catálogo de Itens: CRUD para itens que podem ser adicionados às listas.

* Gerenciamento de Listas: CRUD completo para listas de compras por usuário.

* Comunicação entre Serviços: O serviço de listas consome dados do serviço de itens.

* Ponto de Entrada Único: Todas as requisições são gerenciadas por um API Gateway.

* Descoberta de Serviços: Os serviços se registram e se descobrem dinamicamente.

* Padrões de Resiliência: Implementação de Health Checks e um Circuit Breaker simples.

* Persistência de Dados: Padrão "Database per Service" utilizando bancos de dados NoSQL baseados em arquivos JSON.

## 🏗️ Arquitetura
O sistema é composto por 4 serviços principais que se comunicam via REST. O API Gateway serve como um proxy reverso, roteando as requisições do cliente para o serviço apropriado. O Service Registry (baseado em arquivo) permite que os serviços encontrem uns aos outros na rede.

Snippet de código

```
graph TD
    Client[👤 Cliente] --> APIGateway[API Gateway];

    subgraph "Sistema de Microsserviços"
        APIGateway --> UserService[User Service];
        APIGateway --> ItemService[Item Service];
        APIGateway --> ListService[List Service];

        ListService -- busca detalhes do item --> ItemService;
    end

    subgraph "Bancos de Dados Independentes"
        UserService --- DB_User[(users.json)];
        ItemService --- DB_Item[(items.json)];
        ListService --- DB_List[(lists.json)];
    end

    subgraph "Módulos Compartilhados"
        ServiceRegistry[Service Registry <br> (services-registry.json)]
        UserService -- registra/descobre --> ServiceRegistry;
        ItemService -- registra/descobre --> ServiceRegistry;
        ListService -- registra/descobre --> ServiceRegistry;
        APIGateway -- descobre --> ServiceRegistry;
    end
```

## 🛠️ Tecnologias Utilizadas

* Node.js: Ambiente de execução JavaScript.

* Express.js: Framework para construção das APIs.

* Axios: Cliente HTTP para comunicação entre serviços.

* JSON Web Token (JWT): Para autenticação e autorização.

* bcrypt.js: Para hashing de senhas.

* fs-extra: Para manipulação do banco de dados baseado em arquivos JSON.

* Concurrently: Para executar múltiplos serviços simultaneamente.

* Nodemon: Para reiniciar os serviços automaticamente durante o desenvolvimento.

## 📂 Estrutura do Projeto

```
lista-compras-microservices/
├── api-gateway/            # Ponto de Entrada Único (Porta 3000)
│   └── server.js
├── services/
│   ├── user-service/       # Gerencia usuários e autenticação (Porta 3001)
│   ├── item-service/       # Gerencia o catálogo de itens (Porta 3003)
│   └── list-service/       # Gerencia as listas de compras (Porta 3002)
├── shared/
│   ├── JsonDatabase.js     # Módulo genérico do banco NoSQL
│   └── serviceRegistry.js  # Módulo de descoberta de serviços
├── client-demo.js          # Script para testar a aplicação
├── package.json            # Scripts e dependências centralizadas
└── README.md
```

## 🚀 Como Executar

### Pré-requisitos

* Node.js (v16 ou superior)

* npm (v8 ou superior)

### 1. Instalação
Clone este repositório e instale todas as dependências a partir do diretório raiz. O projeto utiliza um node_modules centralizado na raiz para evitar problemas de resolução de módulos em ambientes virtualizados.

```
git clone https://github.com/gabrieltinoco/LAB-DAMD-microservicos-para-lista-de-compras.git
cd lista-compras-microservices
npm install
```

### 2. Execução
Para executar o ambiente completo, você precisará de 4 terminais para os serviços/gateway e um quinto terminal para rodar o cliente de demonstração.

Opção A: Manual (Recomendado para Debug)

Terminal 1 - User Service:

```
cd services/user-service
npm start
```

Terminal 2 - Item Service (aguarde 5 segundos):

```
cd services/item-service
npm start
```

Terminal 3 - List Service (aguarde 5 segundos):

```
cd services/list-service
npm start
```

Terminal 4 - API Gateway (aguarde 5 segundos):

```
cd api-gateway
npm start
```

Opção B: Concurrently (Logs Misturados)

No diretório raiz, execute:

```
npm start
```

### 3. Teste com o Cliente de Demonstração
Com todos os serviços rodando, abra um quinto terminal na raiz do projeto e execute o script de demonstração:

```
npm run demo
```

O script irá registrar um novo usuário, fazer login, criar uma lista, adicionar itens e exibir um dashboard.

### ⚙️ Endpoints da API
Todas as requisições devem ser feitas para o API Gateway (http://localhost:3000).

| Método | Endpoint               | Serviço Destino | Descrição                                      | Autenticação |
|--------|------------------------|-----------------|------------------------------------------------|--------------|
| POST   | /api/auth/register     | User Service    | Registra um novo usuário.                      | Não          |
| POST   | /api/auth/login        | User Service    | Autentica um usuário e retorna um token.       | Não          |
| GET    | /api/items             | Item Service    | Lista todos os itens do catálogo.              | Não          |
| GET    | /api/search?q={termo}  | Gateway         | Busca global por itens.                        | Não          |
| GET    | /api/lists             | List Service    | Lista todas as listas do usuário logado.       | Sim          |
| POST   | /api/lists             | List Service    | Cria uma nova lista de compras.                | Sim          |
| POST   | /api/lists/{id}/items  | List Service    | Adiciona um item a uma lista.                  | Sim          |
| GET    | /api/dashboard         | Gateway         | Retorna dados agregados de outros serviços.    | Sim          |
| GET    | /health                | Gateway         | Verifica a saúde de todos os serviços.         | Não          |
| GET    | /registry              | Gateway         | Exibe os serviços registrados.                 | Não          |


### 🤔 Troubleshooting

Erro: `Serviço ... indisponível` 

Verifique se todos os 4 serviços estão rodando em seus respectivos terminais.

Execute `curl http://localhost:3000/registry` para ver quais serviços o Gateway reconhece.

Se um serviço estiver faltando, reinicie-o. Se o problema persistir, apague o arquivo `shared/services-registry.json` e reinicie todos os serviços em ordem.

Erro: `Cannot find module '...'` ao iniciar um serviço

Isso indica que as dependências não foram instaladas corretamente. Pare tudo e execute `npm install` a partir do diretório raiz do projeto.
