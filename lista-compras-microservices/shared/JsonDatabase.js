class JsonDatabase {
    constructor(dbPath, collectionName) {
        this.dbPath = dbPath;
        this.collectionName = collectionName;
        this.filePath = path.join(dbPath, `${collectionName}.json`);
        this.indexPath = path.join(dbPath, `${collectionName}_index.json`);

        this.ensureDatabase();
    }

    async ensureDatabase() {
        try {
            // Criar diretório do banco se não existir
            await fs.ensureDir(this.dbPath);

            // Criar arquivo da coleção se não existir
            if (!await fs.pathExists(this.filePath)) {
                await fs.writeJson(this.filePath, []);
            }

            // Criar índice se não existir
            if (!await fs.pathExists(this.indexPath)) {
                await fs.writeJson(this.indexPath, {});
            }
        } catch (error) {
            console.error('Erro ao inicializar banco:', error);
            throw error;
        }
    }

    // Criar documento
    async create(data) {
        try {
            const documents = await this.readAll();
            const document = {
                id: data.id || uuidv4(),
                ...data,
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            documents.push(document);
            await this.writeAll(documents);
            await this.updateIndex(document);

            return document;
        } catch (error) {
            console.error('Erro ao criar documento:', error);
            throw error;
        }
    }

    // Buscar por ID
    async findById(id) {
        try {
            const documents = await this.readAll();
            return documents.find(doc => doc.id === id) || null;
        } catch (error) {
            console.error('Erro ao buscar documento:', error);
            throw error;
        }
    }

    // Buscar um documento com filtro
    async findOne(filter) {
        try {
            const documents = await this.readAll();
            return documents.find(doc => this.matchesFilter(doc, filter)) || null;
        } catch (error) {
            console.error('Erro ao buscar documento:', error);
            throw error;
        }
    }

    // Buscar múltiplos documentos
    async find(filter = {}, options = {}) {
        try {
            let documents = await this.readAll();

            // Aplicar filtro
            if (Object.keys(filter).length > 0) {
                documents = documents.filter(doc => this.matchesFilter(doc, filter));
            }

            // Aplicar ordenação
            if (options.sort) {
                documents = this.sortDocuments(documents, options.sort);
            }

            // Aplicar paginação
            if (options.skip || options.limit) {
                const skip = options.skip || 0;
                const limit = options.limit || documents.length;
                documents = documents.slice(skip, skip + limit);
            }

            return documents;
        } catch (error) {
            console.error('Erro ao buscar documentos:', error);
            throw error;
        }
    }

    // Contar documentos
    async count(filter = {}) {
        try {
            const documents = await this.readAll();
            if (Object.keys(filter).length === 0) {
                return documents.length;
            }
            return documents.filter(doc => this.matchesFilter(doc, filter)).length;
        } catch (error) {
            console.error('Erro ao contar documentos:', error);
            throw error;
        }
    }

    // Atualizar documento
    async update(id, updates) {
        try {
            const documents = await this.readAll();
            const index = documents.findIndex(doc => doc.id === id);

            if (index === -1) {
                return null;
            }

            documents[index] = {
                ...documents[index],
                ...updates,
                id: documents[index].id, // Preservar ID
                createdAt: documents[index].createdAt, // Preservar data de criação
                updatedAt: new Date().toISOString()
            };

            await this.writeAll(documents);
            await this.updateIndex(documents[index]);

            return documents[index];
        } catch (error) {
            console.error('Erro ao atualizar documento:', error);
            throw error;
        }
    }

    // Deletar documento
    async delete(id) {
        try {
            const documents = await this.readAll();
            const index = documents.findIndex(doc => doc.id === id);

            if (index === -1) {
                return false;
            }

            documents.splice(index, 1);
            await this.writeAll(documents);
            await this.removeFromIndex(id);

            return true;
        } catch (error) {
            console.error('Erro ao deletar documento:', error);
            throw error;
        }
    }

    // Busca de texto
    async search(query, fields = []) {
        try {
            const documents = await this.readAll();
            const searchTerm = query.toLowerCase();

            return documents.filter(doc => {
                // Se campos específicos foram fornecidos, buscar apenas neles
                if (fields.length > 0) {
                    return fields.some(field => {
                        const value = this.getNestedValue(doc, field);
                        return value && value.toString().toLowerCase().includes(searchTerm);
                    });
                }

                // Buscar em todos os campos de string do documento
                return this.searchInObject(doc, searchTerm);
            });
        } catch (error) {
            console.error('Erro na busca:', error);
            throw error;
        }
    }

    // Métodos auxiliares
    async readAll() {
        try {
            return await fs.readJson(this.filePath);
        } catch (error) {
            return [];
        }
    }

    async writeAll(documents) {
        await fs.writeJson(this.filePath, documents, { spaces: 2 });
    }

    async updateIndex(document) {
        try {
            const index = await fs.readJson(this.indexPath);
            index[document.id] = {
                id: document.id,
                updatedAt: document.updatedAt
            };
            await fs.writeJson(this.indexPath, index, { spaces: 2 });
        } catch (error) {
            console.error('Erro ao atualizar índice:', error);
        }
    }

    async removeFromIndex(id) {
        try {
            const index = await fs.readJson(this.indexPath);
            delete index[id];
            await fs.writeJson(this.indexPath, index, { spaces: 2 });
        } catch (error) {
            console.error('Erro ao remover do índice:', error);
        }
    }

    matchesFilter(document, filter) {
        return Object.entries(filter).every(([key, value]) => {
            const docValue = this.getNestedValue(document, key);

            if (typeof value === 'object' && value !== null) {
                // Operadores especiais
                if (value.$regex) {
                    const regex = new RegExp(value.$regex, value.$options || 'i');
                    return regex.test(docValue);
                }
                if (value.$in) {
                    return value.$in.includes(docValue);
                }
                if (value.$gt) {
                    return docValue > value.$gt;
                }
                if (value.$lt) {
                    return docValue < value.$lt;
                }
                if (value.$gte) {
                    return docValue >= value.$gte;
                }
                if (value.$lte) {
                    return docValue <= value.$lte;
                }
            }

            return docValue === value;
        });
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    sortDocuments(documents, sortOptions) {
        return documents.sort((a, b) => {
            for (const [field, direction] of Object.entries(sortOptions)) {
                const valueA = this.getNestedValue(a, field);
                const valueB = this.getNestedValue(b, field);

                let comparison = 0;
                if (valueA < valueB) comparison = -1;
                if (valueA > valueB) comparison = 1;

                if (comparison !== 0) {
                    return direction === -1 ? -comparison : comparison;
                }
            }
            return 0;
        });
    }

    searchInObject(obj, searchTerm) {
        for (const value of Object.values(obj)) {
            if (typeof value === 'string' && value.toLowerCase().includes(searchTerm)) {
                return true;
            }
            if (typeof value === 'object' && value !== null && this.searchInObject(value, searchTerm)) {
                return true;
            }
        }
        return false;
    }
}

module.exports = JsonDatabase;