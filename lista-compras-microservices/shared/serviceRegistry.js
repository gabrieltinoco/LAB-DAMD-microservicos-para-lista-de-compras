const fs = require('fs');
const path = require('path');

class FileBasedServiceRegistry {
    constructor() {
        this.registryFile = path.join(__dirname, 'services-registry.json');
        this.ensureRegistryFile();
        console.log('File-based Service Registry inicializado:', this.registryFile);
    }

    ensureRegistryFile() {
        if (!fs.existsSync(this.registryFile)) {
            this.writeRegistry({});
        }
    }

    readRegistry() {
        try {
            const data = fs.readFileSync(this.registryFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Erro ao ler registry file:', error.message);
            return {};
        }
    }

    writeRegistry(services) {
        try {
            fs.writeFileSync(this.registryFile, JSON.stringify(services, null, 2));
        } catch (error) {
            console.error('Erro ao escrever registry file:', error.message);
        }
    }

    // Registrar um serviço
    register(serviceName, serviceInfo) {
        const services = this.readRegistry();
        
        services[serviceName] = {
            ...serviceInfo,
            registeredAt: Date.now(),
            lastHealthCheck: Date.now(),
            healthy: true,
            pid: process.pid
        };
        
        this.writeRegistry(services);
        console.log(`Serviço registrado: ${serviceName} - ${serviceInfo.url} (PID: ${process.pid})`);
        console.log(`Total de serviços: ${Object.keys(services).length}`);
    }

    // Descobrir um serviço
    discover(serviceName) {
        const services = this.readRegistry();
        console.log(`Procurando serviço: ${serviceName}`);
        console.log(`Serviços disponíveis: ${Object.keys(services).join(', ')}`);
        
        const service = services[serviceName];
        if (!service) {
            console.error(`Serviço não encontrado: ${serviceName}`);
            console.error(`Serviços registrados:`, Object.keys(services));
            throw new Error(`Serviço não encontrado: ${serviceName}`);
        }
        
        if (!service.healthy) {
            console.error(`Serviço indisponível: ${serviceName}`);
            throw new Error(`Serviço indisponível: ${serviceName}`);
        }
        
        console.log(`Serviço encontrado: ${serviceName} - ${service.url}`);
        return service;
    }

    // Listar todos os serviços
    listServices() {
        const services = this.readRegistry();
        const serviceList = {};
        
        Object.entries(services).forEach(([name, service]) => {
            serviceList[name] = {
                url: service.url,
                healthy: service.healthy,
                registeredAt: new Date(service.registeredAt).toISOString(),
                uptime: Date.now() - service.registeredAt,
                pid: service.pid
            };
        });
        
        return serviceList;
    }

    // Remover serviço
    unregister(serviceName) {
        const services = this.readRegistry();
        if (services[serviceName]) {
            delete services[serviceName];
            this.writeRegistry(services);
            console.log(`Serviço removido: ${serviceName}`);
            return true;
        }
        return false;
    }

    // Health check de um serviço
    updateHealth(serviceName, healthy) {
        const services = this.readRegistry();
        if (services[serviceName]) {
            services[serviceName].healthy = healthy;
            services[serviceName].lastHealthCheck = Date.now();
            this.writeRegistry(services);
            const status = healthy ? 'OK' : 'FAIL';
            console.log(`Health check: ${serviceName} - ${status}`);
        }
    }

    // Health check de todos os serviços
    async performHealthChecks() {
        const axios = require('axios');
        const services = this.readRegistry();
        
        console.log(`Executando health checks de ${Object.keys(services).length} serviços...`);
        
        for (const [serviceName, service] of Object.entries(services)) {
            try {
                await axios.get(`${service.url}/health`, { 
                    timeout: 5000,
                    family: 4
                });
                this.updateHealth(serviceName, true);
            } catch (error) {
                console.error(`Health check falhou para ${serviceName}:`, error.message);
                this.updateHealth(serviceName, false);
            }
        }
    }

    // Debug: listar serviços registrados
    debugListServices() {
        const services = this.readRegistry();
        console.log('DEBUG - Serviços registrados:');
        Object.entries(services).forEach(([name, service]) => {
            console.log(`   ${name}: ${service.url} (${service.healthy ? 'healthy' : 'unhealthy'}) PID:${service.pid}`);
        });
    }

    // Verificar se um serviço existe
    hasService(serviceName) {
        const services = this.readRegistry();
        return services.hasOwnProperty(serviceName);
    }

    // Obter estatísticas
    getStats() {
        const services = this.readRegistry();
        const total = Object.keys(services).length;
        let healthy = 0;
        let unhealthy = 0;

        Object.values(services).forEach(service => {
            if (service.healthy) {
                healthy++;
            } else {
                unhealthy++;
            }
        });

        return { total, healthy, unhealthy };
    }

    // Limpar registry (útil para desenvolvimento)
    clear() {
        this.writeRegistry({});
        console.log('Registry limpo');
    }

    // Cleanup na saída do processo
    cleanup() {
        // Remove serviços deste PID ao sair
        const services = this.readRegistry();
        const currentPid = process.pid;
        let changed = false;

        Object.entries(services).forEach(([name, service]) => {
            if (service.pid === currentPid) {
                delete services[name];
                changed = true;
                console.log(`Removendo serviço ${name} do PID ${currentPid}`);
            }
        });

        if (changed) {
            this.writeRegistry(services);
        }
    }
}

// Criar instância singleton
const registry = new FileBasedServiceRegistry();

// Cleanup ao sair do processo
process.on('exit', () => registry.cleanup());
process.on('SIGINT', () => {
    registry.cleanup();
    process.exit(0);
});
process.on('SIGTERM', () => {
    registry.cleanup();
    process.exit(0);
});

module.exports = registry;