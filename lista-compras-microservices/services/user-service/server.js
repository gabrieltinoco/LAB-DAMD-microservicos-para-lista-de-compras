// services/user-service/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const JsonDatabase = require('../../shared/JsonDatabase');
const serviceRegistry = require('../../shared/serviceRegistry');

class UserService {
    constructor() {
        this.app = express();
        this.port = 3001;
        this.serviceName = 'user-service';
        this.serviceUrl = `http://127.0.0.1:${this.port}`;
        
        this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupDatabase() {
        const dbPath = path.join(__dirname, 'database');
        this.usersDb = new JsonDatabase(dbPath, 'users');
        console.log('User Service: Banco NoSQL inicializado');
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(morgan('combined'));
        this.app.use(express.json());
    }

    setupRoutes() {
        this.app.get('/health', (req, res) => res.json({ service: this.serviceName, status: 'healthy' }));
        this.app.post('/auth/register', this.register.bind(this));
        this.app.post('/auth/login', this.login.bind(this));
        this.app.post('/auth/validate', this.validateToken.bind(this)); // Rota para outros serviços validarem o token

        this.app.get('/users/:id', this.authMiddleware.bind(this), this.getUser.bind(this));
        this.app.put('/users/:id', this.authMiddleware.bind(this), this.updateUser.bind(this));
    }

    authMiddleware(req, res, next) {
        const authHeader = req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Token obrigatório' });
        }
        const token = authHeader.replace('Bearer ', '');
        try {
            const decoded = jwt.verify(token, 'sua-chave-secreta-jwt'); // Use uma variável de ambiente para isso
            req.user = decoded;
            next();
        } catch (error) {
            res.status(401).json({ success: false, message: 'Token inválido' });
        }
    }

    async register(req, res) {
        try {
            const { email, username, password, firstName, lastName } = req.body;
            if (!email || !username || !password || !firstName || !lastName) {
                return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios' });
            }

            const existingUser = await this.usersDb.findOne({ $or: [{ email }, { username }] });
            if (existingUser) {
                return res.status(409).json({ success: false, message: 'Email ou username já em uso' });
            }

            const hashedPassword = await bcrypt.hash(password, 12);

            const newUser = await this.usersDb.create({
                id: uuidv4(),
                email,
                username,
                password: hashedPassword,
                firstName,
                lastName,
                preferences: {
                    defaultStore: "Any",
                    currency: "BRL"
                }
            });

            const { password: _, ...userWithoutPassword } = newUser;
            res.status(201).json({ success: true, data: userWithoutPassword });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro interno do servidor' });
        }
    }

    // VERSÃO NOVA E CORRIGIDA
async login(req, res) {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: 'Identificador e senha são obrigatórios' });
        }

        // Busca primeiro por email, depois por username
        let user = await this.usersDb.findOne({ email: identifier });
        if (!user) {
            user = await this.usersDb.findOne({ username: identifier });
        }

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            'sua-chave-secreta-jwt',
            { expiresIn: '24h' }
        );

        const { password: _, ...userWithoutPassword } = user;
        res.json({ success: true, data: { user: userWithoutPassword, token } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
}
    
    async validateToken(req, res) {
        try {
            const { token } = req.body;
            const decoded = jwt.verify(token, 'sua-chave-secreta-jwt');
            const user = await this.usersDb.findById(decoded.id);
            if (!user) return res.status(404).json({ success: false, message: 'Usuário do token não encontrado' });
            
            const { password: _, ...userWithoutPassword } = user;
            res.json({ success: true, data: { user: userWithoutPassword } });
        } catch (error) {
            res.status(401).json({ success: false, message: 'Token inválido' });
        }
    }


    async getUser(req, res) {
        // Um usuário só pode ver seu próprio perfil.
        if (req.user.id !== req.params.id) {
            return res.status(403).json({ success: false, message: 'Acesso negado' });
        }
        const user = await this.usersDb.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        
        const { password, ...userWithoutPassword } = user;
        res.json({ success: true, data: userWithoutPassword });
    }

    async updateUser(req, res) {
        if (req.user.id !== req.params.id) {
            return res.status(403).json({ success: false, message: 'Acesso negado' });
        }
        const { firstName, lastName, preferences } = req.body;
        const updates = { firstName, lastName, preferences };
        
        const updatedUser = await this.usersDb.update(req.params.id, updates);
        if(!updatedUser) return res.status(404).json({ success: false, message: 'Usuário não encontrado' });

        const { password, ...userWithoutPassword } = updatedUser;
        res.json({ success: true, data: userWithoutPassword });
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`=====================================`);
            console.log(`User Service iniciado na porta ${this.port}`);
            serviceRegistry.register(this.serviceName, { url: this.serviceUrl });
            setInterval(() => serviceRegistry.updateHealth(this.serviceName, true), 30000);
            console.log(`=====================================`);
        });
    }
}

if (require.main === module) {
    const userService = new UserService();
    userService.start();
}