/**
 * IA Interna - Sistema de Gestão CLS
 * 
 * Este módulo implementa a IA interna para cruzamento de planilhas, validação de nomes,
 * detecção de conflitos e exibição do modal de aprovação de alterações.
 */

// Classe principal da IA interna
class InternalAI {
    constructor() {
        this.originalData = null; // Dados originais antes das alterações
        this.suggestedChanges = []; // Alterações sugeridas pela IA
        this.conflicts = []; // Conflitos detectados
        this.validationErrors = []; // Erros de validação
        this.autoCorrections = []; // Correções automáticas
    }

    /**
     * Processa os dados importados das planilhas
     * @param {Object} roomImportData - Dados importados da planilha de salas
     * @param {Array} professionals - Lista de profissionais cadastrados
     * @param {Array} appointments - Lista de agendamentos existentes
     * @returns {Object} - Resultado do processamento
     */
    processImportedData(roomImportData, professionals, appointments) {
        // Armazena os dados originais para comparação posterior
        this.originalData = {
            schedule: JSON.parse(JSON.stringify(roomImportData.schedule)),
            newProfessionals: JSON.parse(JSON.stringify(roomImportData.newProfessionals)),
            updatedAppointments: JSON.parse(JSON.stringify(roomImportData.updatedAppointments))
        };

        // Limpa os arrays de resultados
        this.suggestedChanges = [];
        this.conflicts = [];
        this.validationErrors = [];
        this.autoCorrections = [];

        // 1. Validação de nomes de pacientes e profissionais
        this._validateNames(roomImportData, professionals, appointments);

        // 2. Detecção de conflitos de horários
        this._detectScheduleConflicts(roomImportData, professionals, appointments);

        // 3. Detecção de salas ou horários duplicados
        this._detectDuplicateRoomsOrTimes(roomImportData);

        // 4. Verificação de profissionais inativos
        this._checkInactiveProfessionals(roomImportData, professionals);

        // Retorna o resultado do processamento
        return {
            suggestedChanges: this.suggestedChanges,
            conflicts: this.conflicts,
            validationErrors: this.validationErrors,
            autoCorrections: this.autoCorrections,
            processedData: {
                schedule: roomImportData.schedule,
                newProfessionals: roomImportData.newProfessionals,
                updatedAppointments: roomImportData.updatedAppointments
            }
        };
    }

    /**
     * Valida nomes de pacientes e profissionais
     * @param {Object} roomImportData - Dados importados da planilha de salas
     * @param {Array} professionals - Lista de profissionais cadastrados
     * @param {Array} appointments - Lista de agendamentos existentes
     * @private
     */
    _validateNames(roomImportData, professionals, appointments) {
        // Extrai todos os nomes de pacientes e profissionais dos agendamentos existentes
        const registeredPatients = [...new Set(appointments.map(apt => apt.client.toLowerCase().trim()))];
        const registeredProfessionals = professionals.map(prof => prof.name.toLowerCase().trim());

        // Verifica cada entrada na programação de salas
        roomImportData.schedule.forEach(slot => {
            // Pula slots vazios
            if (!slot.isOccupied) return;

            // Validação de pacientes
            if (slot.patientName) {
                const patientLower = slot.patientName.toLowerCase().trim();
                if (!registeredPatients.includes(patientLower)) {
                    // Tenta encontrar uma correspondência próxima
                    const closestMatch = this._findClosestMatch(patientLower, registeredPatients);
                    
                    if (closestMatch) {
                        // Encontrou uma correspondência próxima - sugerir correção
                        const originalCase = appointments.find(apt => 
                            apt.client.toLowerCase().trim() === closestMatch
                        );

                        if (originalCase) {
                            const originalName = slot.patientName;
                            slot.patientName = originalCase.client;
                            
                            this.autoCorrections.push({
                                type: 'Paciente',
                                original: originalName,
                                corrected: originalCase.client,
                                location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                                slotId: slot.id
                            });

                            this.suggestedChanges.push({
                                type: 'Correção de Nome de Paciente',
                                description: `Corrigir "${originalName}" para "${originalCase.client}"`,
                                location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                                slotId: slot.id
                            });
                        }
                    } else {
                        // Não encontrou correspondência - registrar erro de validação
                        this.validationErrors.push({
                            type: 'Paciente',
                            name: slot.patientName,
                            location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                            slotId: slot.id
                        });

                        this.suggestedChanges.push({
                            type: 'Erro de Validação',
                            description: `Paciente "${slot.patientName}" não encontrado no cadastro`,
                            location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                            slotId: slot.id
                        });
                    }
                }
            }

            // Validação de profissionais
            if (slot.professionalName) {
                const profLower = slot.professionalName.toLowerCase().trim();
                if (!registeredProfessionals.includes(profLower)) {
                    // Verifica se já está na lista de novos profissionais
                    const isNewProf = roomImportData.newProfessionals.some(p => 
                        p.name.toLowerCase().trim() === profLower
                    );

                    if (!isNewProf) {
                        // Tenta encontrar uma correspondência próxima
                        const closestMatch = this._findClosestMatch(profLower, registeredProfessionals);
                        
                        if (closestMatch) {
                            // Encontrou uma correspondência próxima - sugerir correção
                            const originalProf = professionals.find(p => 
                                p.name.toLowerCase().trim() === closestMatch
                            );

                            if (originalProf) {
                                const originalName = slot.professionalName;
                                slot.professionalName = originalProf.name;
                                slot.professionalId = originalProf.id;
                                
                                this.autoCorrections.push({
                                    type: 'Profissional',
                                    original: originalName,
                                    corrected: originalProf.name,
                                    location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                                    slotId: slot.id
                                });

                                this.suggestedChanges.push({
                                    type: 'Correção de Nome de Profissional',
                                    description: `Corrigir "${originalName}" para "${originalProf.name}"`,
                                    location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                                    slotId: slot.id
                                });
                            }
                        } else {
                            // Não encontrou correspondência - criar novo profissional
                            const newProfessional = {
                                id: `ai_new_prof_${Date.now()}_${Math.random()}`,
                                name: slot.professionalName,
                                specialty: 'Importado - IA',
                                registration: '',
                                inactive: false
                            };
                            
                            roomImportData.newProfessionals.push(newProfessional);
                            slot.professionalId = newProfessional.id;
                            
                            this.validationErrors.push({
                                type: 'Profissional',
                                name: slot.professionalName,
                                location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                                action: 'Novo profissional será criado',
                                slotId: slot.id
                            });

                            this.suggestedChanges.push({
                                type: 'Novo Profissional',
                                description: `Criar novo profissional "${slot.professionalName}"`,
                                location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                                slotId: slot.id
                            });
                        }
                    }
                }
            }
        });
    }

    /**
     * Detecta conflitos de horários
     * @param {Object} roomImportData - Dados importados da planilha de salas
     * @param {Array} professionals - Lista de profissionais cadastrados
     * @param {Array} appointments - Lista de agendamentos existentes
     * @private
     */
    _detectScheduleConflicts(roomImportData, professionals, appointments) {
        // Agrupa os slots por profissional, dia e horário
        const slotsByProfDayTime = {};
        
        roomImportData.schedule.forEach(slot => {
            if (!slot.isOccupied || !slot.professionalId) return;
            
            const key = `${slot.professionalId}_${slot.appointmentDate}_${slot.time}`;
            
            if (!slotsByProfDayTime[key]) {
                slotsByProfDayTime[key] = [];
            }
            
            slotsByProfDayTime[key].push(slot);
        });
        
        // Verifica conflitos entre slots importados
        for (const key in slotsByProfDayTime) {
            const slots = slotsByProfDayTime[key];
            
            if (slots.length > 1) {
                // Conflito detectado - mesmo profissional em múltiplas salas no mesmo horário
                const profName = slots[0].professionalName;
                const conflictingRooms = slots.map(s => s.roomName).join(', ');
                const dayTime = `${slots[0].dayOfWeek} ${slots[0].time}`;
                
                this.conflicts.push({
                    type: 'Profissional em Múltiplas Salas',
                    professionalName: profName,
                    rooms: conflictingRooms,
                    dayTime: dayTime,
                    slots: slots.map(s => s.id)
                });

                // Marca os slots com conflito
                slots.forEach(slot => {
                    slot.hasScheduleConflict = true;
                    
                    this.suggestedChanges.push({
                        type: 'Conflito de Horário',
                        description: `Profissional "${profName}" agendado em múltiplas salas: ${conflictingRooms}`,
                        location: `${dayTime}`,
                        slotId: slot.id
                    });
                });
            }
        }
        
        // Verifica conflitos com agendamentos existentes
        roomImportData.schedule.forEach(slot => {
            if (!slot.isOccupied || !slot.professionalId) return;
            
            // Verifica se já existe um agendamento para este profissional neste horário
            const conflictingAppointments = appointments.filter(apt => 
                apt.professionalId === slot.professionalId &&
                apt.date === slot.appointmentDate &&
                apt.time === slot.time &&
                (!slot.linkedAppointmentId || apt.id !== slot.linkedAppointmentId) // Ignora o próprio agendamento vinculado
            );
            
            if (conflictingAppointments.length > 0) {
                // Conflito com agendamento existente
                const profName = slot.professionalName;
                const conflictingClients = conflictingAppointments.map(apt => apt.client).join(', ');
                
                this.conflicts.push({
                    type: 'Conflito com Agendamento Existente',
                    professionalName: profName,
                    patientName: slot.patientName,
                    room: slot.roomName,
                    dayTime: `${slot.dayOfWeek} ${slot.time}`,
                    conflictingAppointments: conflictingAppointments.map(apt => ({
                        id: apt.id,
                        client: apt.client,
                        type: apt.type
                    })),
                    slotId: slot.id
                });
                
                // Marca o slot com conflito
                slot.hasScheduleConflict = true;
                
                this.suggestedChanges.push({
                    type: 'Conflito com Agendamento',
                    description: `Profissional "${profName}" já tem agendamento com "${conflictingClients}"`,
                    location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                    slotId: slot.id
                });
            }
        });
    }

    /**
     * Detecta salas ou horários duplicados
     * @param {Object} roomImportData - Dados importados da planilha de salas
     * @private
     */
    _detectDuplicateRoomsOrTimes(roomImportData) {
        // Agrupa os slots por sala, dia e horário
        const slotsByRoomDayTime = {};
        
        roomImportData.schedule.forEach(slot => {
            if (!slot.isOccupied) return;
            
            const key = `${slot.roomName}_${slot.dayOfWeek}_${slot.time}`;
            
            if (!slotsByRoomDayTime[key]) {
                slotsByRoomDayTime[key] = [];
            }
            
            slotsByRoomDayTime[key].push(slot);
        });
        
        // Verifica duplicatas
        for (const key in slotsByRoomDayTime) {
            const slots = slotsByRoomDayTime[key];
            
            if (slots.length > 1) {
                // Duplicata detectada - mesma sala com múltiplos agendamentos no mesmo horário
                const roomName = slots[0].roomName;
                const dayTime = `${slots[0].dayOfWeek} ${slots[0].time}`;
                const patients = slots.map(s => s.patientName).filter(Boolean).join(', ');
                const professionals = slots.map(s => s.professionalName).filter(Boolean).join(', ');
                
                this.conflicts.push({
                    type: 'Sala com Múltiplos Agendamentos',
                    roomName: roomName,
                    dayTime: dayTime,
                    patients: patients,
                    professionals: professionals,
                    slots: slots.map(s => s.id)
                });

                // Marca os slots com conflito
                slots.forEach(slot => {
                    slot.hasScheduleConflict = true;
                    
                    this.suggestedChanges.push({
                        type: 'Sala Duplicada',
                        description: `Sala "${roomName}" com múltiplos agendamentos no mesmo horário`,
                        location: `${dayTime}`,
                        slotId: slot.id
                    });
                });
            }
        }
    }

    /**
     * Verifica profissionais inativos
     * @param {Object} roomImportData - Dados importados da planilha de salas
     * @param {Array} professionals - Lista de profissionais cadastrados
     * @private
     */
    _checkInactiveProfessionals(roomImportData, professionals) {
        roomImportData.schedule.forEach(slot => {
            if (!slot.isOccupied || !slot.professionalId) return;
            
            // Verifica se o profissional está inativo
            const professional = professionals.find(p => p.id === slot.professionalId);
            
            if (professional && professional.inactive) {
                this.conflicts.push({
                    type: 'Profissional Inativo',
                    professionalName: professional.name,
                    patientName: slot.patientName,
                    room: slot.roomName,
                    dayTime: `${slot.dayOfWeek} ${slot.time}`,
                    slotId: slot.id
                });
                
                // Marca o slot com erro de validação
                slot.hasValidationError = true;
                
                this.suggestedChanges.push({
                    type: 'Profissional Inativo',
                    description: `Profissional "${professional.name}" está inativo`,
                    location: `${slot.roomName} - ${slot.dayOfWeek} ${slot.time}`,
                    slotId: slot.id
                });
            }
        });
    }

    /**
     * Encontra a correspondência mais próxima para um nome
     * @param {string} name - Nome a ser verificado
     * @param {Array} registeredList - Lista de nomes registrados
     * @returns {string|null} - Nome correspondente ou null se não encontrado
     * @private
     */
    _findClosestMatch(name, registeredList) {
        const nameLower = name.toLowerCase().trim();
        
        // Correspondência exata
        const exactMatch = registeredList.find(registered => registered === nameLower);
        if (exactMatch) return exactMatch;
        
        // Correspondência aproximada - verifica nomes similares
        for (const registered of registeredList) {
            // Verifica se os nomes são similares (contém ou correspondência parcial)
            if (registered.includes(nameLower) || nameLower.includes(registered)) {
                return registered;
            }
            
            // Verifica erros comuns de digitação (verificação simples de Levenshtein)
            const similarity = this._calculateSimilarity(nameLower, registered);
            if (similarity > 0.8) { // 80% de similaridade como limite
                return registered;
            }
        }
        
        return null;
    }

    /**
     * Calcula a similaridade entre duas strings
     * @param {string} str1 - Primeira string
     * @param {string} str2 - Segunda string
     * @returns {number} - Valor de similaridade entre 0 e 1
     * @private
     */
    _calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this._levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Calcula a distância de Levenshtein entre duas strings
     * @param {string} str1 - Primeira string
     * @param {string} str2 - Segunda string
     * @returns {number} - Distância de Levenshtein
     * @private
     */
    _levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Exibe o modal de conflitos com as alterações sugeridas
     * @param {Function} onAccept - Função a ser chamada quando o usuário aceitar as alterações
     * @param {Function} onCancel - Função a ser chamada quando o usuário cancelar as alterações
     */
    showConflictsModal(onAccept, onCancel) {
        // Elementos do modal
        const modal = document.getElementById('aiConflictModal');
        const detailsContainer = document.getElementById('aiConflictDetails');
        const acceptBtn = document.getElementById('aiAcceptChangesBtn');
        const cancelBtn = document.getElementById('aiCancelChangesBtn');
        
        // Limpa o conteúdo anterior
        detailsContainer.innerHTML = '';
        
        // Adiciona as informações de conflitos e alterações sugeridas
        let content = '';
        
        // Resumo das alterações
        content += `<div class="mb-4 p-3 bg-blue-50 rounded-lg">
            <h4 class="font-semibold text-blue-800 mb-2">📊 Resumo das Alterações</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between items-center p-2 bg-yellow-50 rounded">
                    <span>Conflitos Detectados:</span>
                    <span class="bg-yellow-500 text-white px-2 py-1 rounded">${this.conflicts.length}</span>
                </div>
                <div class="flex justify-between items-center p-2 bg-red-50 rounded">
                    <span>Erros de Validação:</span>
                    <span class="bg-red-500 text-white px-2 py-1 rounded">${this.validationErrors.length}</span>
                </div>
                <div class="flex justify-between items-center p-2 bg-green-50 rounded">
                    <span>Correções Automáticas:</span>
                    <span class="bg-green-500 text-white px-2 py-1 rounded">${this.autoCorrections.length}</span>
                </div>
                <div class="flex justify-between items-center p-2 bg-blue-50 rounded">
                    <span>Total de Alterações:</span>
                    <span class="bg-blue-500 text-white px-2 py-1 rounded">${this.suggestedChanges.length}</span>
                </div>
            </div>
        </div>`;
        
        // Detalhes das alterações sugeridas
        if (this.suggestedChanges.length > 0) {
            content += `<div class="mb-4">
                <h4 class="font-semibold text-gray-800 mb-2">🔍 Alterações Sugeridas</h4>
                <div class="max-h-60 overflow-y-auto border rounded-lg">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-100 sticky top-0">
                            <tr>
                                <th class="p-2 text-left">Tipo</th>
                                <th class="p-2 text-left">Descrição</th>
                                <th class="p-2 text-left">Local</th>
                            </tr>
                        </thead>
                        <tbody>
`;
            
            this.suggestedChanges.forEach((change, index) => {
                const bgClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                let typeClass = 'text-blue-600';
                
                if (change.type.includes('Conflito')) {
                    typeClass = 'text-orange-600';
                } else if (change.type.includes('Erro')) {
                    typeClass = 'text-red-600';
                } else if (change.type.includes('Correção')) {
                    typeClass = 'text-green-600';
                }
                
                content += `<tr class="${bgClass} border-t">
                    <td class="p-2 ${typeClass}">${change.type}</td>
                    <td class="p-2">${change.description}</td>
                    <td class="p-2 text-gray-600">${change.location}</td>
                </tr>`;
            });
            
            content += `</tbody></table></div></div>`;
        }
        
        // Aviso sobre as alterações
        content += `<div class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p class="text-sm text-yellow-800">
                <strong>⚠️ Atenção:</strong> Aceitar aplicará todas as alterações sugeridas acima.
                Cancelar manterá os dados originais sem modificações.
            </p>
        </div>`;
        
        // Adiciona o conteúdo ao modal
        detailsContainer.innerHTML = content;
        
        // Configura os botões
        acceptBtn.onclick = () => {
            modal.classList.remove('active');
            if (typeof onAccept === 'function') onAccept();
        };
        
        cancelBtn.onclick = () => {
            modal.classList.remove('active');
            if (typeof onCancel === 'function') onCancel();
        };
        
        // Exibe o modal
        modal.classList.add('active');
    }
}

// Instância global da IA interna
const internalAI = new InternalAI();