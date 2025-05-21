<script setup lang="ts">
import Chart from 'primevue/chart';
import { computed, reactive, ref, watch } from 'vue';
import MathLiveInput from './MathLiveInput.vue';
import { Button } from 'primevue';
import ScrollPanel from 'primevue/scrollpanel';
import Dialog from 'primevue/dialog';
import { ComputeEngine } from '@cortex-js/compute-engine';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import { eulerStep, modifiedEulerStep, rungeKuttaStep, type Context, type DerivativeSystem, type Vector } from '@/utils/methods';
import { useFormula } from '@/stores/formulaStore';

interface VariableData {
    name: string
    value: number
}

const formula_store = useFormula()

const formulas = formula_store.formulas
const editDialogVisible = ref(false)
const editDialogTarget = ref<Number | null>(null)
const methodOptions = ref([{ name: "Метод Эйлера", value: "standard" }, { name: "Модифицированный метод Эйлера", value: "modified" }, { name: "Рунге Кутта 4-го порядка", value: "runge" }])
const selectedMethod = ref({ name: "Метод Эйлера", value: "standard" })

const computeEngine = new ComputeEngine()

function addFormula() {
    let func = ""
    if (formulas.length + 1 < 10)
        func = `f_${formulas.length + 1}`
    else
        func = `f_{${formulas.length + 1}}`

    formulas.push({
        func: func,
        text: ''
    })
}

function editFormula(pos: Number) {
    editDialogVisible.value = true
    editDialogTarget.value = pos
}

function closeDialog() {
    editDialogTarget.value = null
    editDialogVisible.value = false
}

const chartData = computed(() => {
    const documentStyle = getComputedStyle(document.documentElement);

    const zip = (a: number[], b: number[]) => a.map((k: any, i: any) => { return { x: k, y: b[i] } });

    const datasets: any[] = []

    formulas.forEach((f) => {
        if (functionsValues.value[f.func] == undefined) return
        datasets.push({
            label: f.func,
            data: zip(argumentValues.value, functionsValues.value[f.func])
        })
    })
    return {
        datasets: datasets
    };
})

const chartOptions = computed(() => {
    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--p-text-color');
    const textColorSecondary = documentStyle.getPropertyValue('--p-text-muted-color');
    const surfaceBorder = documentStyle.getPropertyValue('--p-content-border-color');

    return {
        type: 'scatter',
        maintainAspectRatio: false,
        aspectRatio: 0.6,
        plugins: {
            legend: {
                labels: {
                    color: textColor
                }
            }
        },
        scales: {
            x: {
                type: 'linear',
                ticks: {
                    color: textColorSecondary
                },
                grid: {
                    color: surfaceBorder
                }
            },
            y: {
                type: 'linear',
                ticks: {
                    color: textColorSecondary
                },
                grid: {
                    color: surfaceBorder
                }
            }
        }
    };
})

const findedFreeVars = ref<VariableData[]>([])
const additionalVars = ref<VariableData[]>([{ name: "x_0", value: 0 }, { name: "h", value: 0.1 }, { name: "n", value: 20 }])

function formatLatexIndex(char: string, value: string) {
    return value.length === 1 ? `${char}${value}` : `${char}{${value}}`;
}

function cortexSymbolToLatex(symbol: string) {
    const greekLetters = new Set([
        "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa",
        "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau", "upsilon", "phi",
        "chi", "psi", "omega"
    ]);

    const match = symbol.match(/^([a-zA-Z]+)(?:_([0-9]+))?(?:\^([0-9]+))?$/);
    if (!match) return symbol;

    const [, name, sub, sup] = match;
    const base = greekLetters.has(name) ? `\\${name}` : name;

    let result = base;
    if (sub) result += formatLatexIndex("_", sub);
    if (sup) result += formatLatexIndex("^", sup);

    return result;
}


watch(() => formulas, () => {
    const uniqueVars: string[] = []
    formulas.forEach((formula) => {
        let res = (computeEngine?.parse(formula.text))
        const freeVars = res.unknowns

        freeVars.forEach((vr) => {
            const converted = cortexSymbolToLatex(vr)
            if (!uniqueVars.includes(converted)) uniqueVars.push(converted)
        })
    })
    const isFunctionName = (name: string) => formulas.some((formula) => formula.func === name);

    formulas.forEach((formula, i) => {
        uniqueVars.push(`${formula.func}_{,0}`)
    })

    const filteredVars = uniqueVars.filter((v) => v !== 'Nothing' && !isFunctionName(v) && v !== "x");

    findedFreeVars.value = findedFreeVars.value.filter((v) => filteredVars.includes(v.name))
        .map((v) => ({ name: v.name, value: v.value }));
    const newVars = filteredVars.filter((v) => !findedFreeVars.value.find((v2) => v2.name === v));
    findedFreeVars.value.push(...newVars.map((name) => ({ name, value: 0 })));
}, { deep: true });

type FunctionValuesList = { [id: string]: number[] }
const functionsValues = ref<FunctionValuesList>({})
const argumentValues = ref<number[]>([])

const freeVariables = computed(() => {
    return [...additionalVars.value, ...findedFreeVars.value]
})

function getContext() {
    const context: { [id: string]: number } = {}
    freeVariables.value.forEach((vr) => {
        let index = computeEngine.parse(vr.name).symbol
        if (index)
            context[index] = vr.value
    })
    return context
}

function getVar(name: string) {
    return freeVariables.value.find((v) => v.name == name)
}

watch([() => formulas, () => freeVariables.value, () => selectedMethod.value], () => {
    const functions: { [id: string]: Function } = {}
    const workingFormulas = []

    for (let i = 0; i < formulas.length; i++) {
        const f = formulas[i];
        if (f.text == "") return
        try {
            console.log(f.text)
            console.log(computeEngine.parse(f.text))
            const func = computeEngine.parse(f.text).compile()
            functions[f.func] = func
            workingFormulas.push(f)
        } catch (error) {
            console.error("Parsing exception: ", error)
        }
    }

    const n = getVar("n")?.value
    const h = getVar("h")?.value
    const x_0 = getVar("x_0")?.value

    if (n == undefined || h == undefined || x_0 == undefined) return

    const newValues: FunctionValuesList = {}
    const newArgSteps: number[] = [x_0]

    const funcIds = workingFormulas.map(f => f.func);

    if (funcIds.length == 0) return
    // Обернуть функции, подменяя y[i] в context
    const fList: DerivativeSystem = funcIds.map((funcId, i) => {
        return (t: number, y_i: number, fullContext: Context) => {
            // Клонируем context последнего шага
            const vars = { ...fullContext[fullContext.length - 1] };
            vars[funcId] = y_i;
            return functions[funcId](vars);
        };
    });

    // Начальное значение вектора y
    workingFormulas.forEach((f) => {
        const start_value = getVar(f.func + "_{,0}")
        if (!start_value) return
        newValues[f.func] = ([start_value.value])
    })


    let y: Vector = funcIds.map((id) => newValues[id][0]);

    const constContext = getContext();

    const methodFunction = {
        "standard": eulerStep,
        "modified": modifiedEulerStep,
        "runge": rungeKuttaStep
    }[selectedMethod.value.value]

    if (!methodFunction)
        throw "IDK"

    for (let step = 0; step < n; step++) {
        const x = x_0 + step * h;

        const currentContext: Record<string, number> = { ...constContext };
        funcIds.forEach((id) => {
            let index = computeEngine.parse(id).symbol
            if (index)
                currentContext[index] = newValues[id][newValues[id].length - 1];
        });
        currentContext["x"] = x

        const contextHistory: Context = [currentContext];

        const [nextX, nextY] = methodFunction(fList, x, y, contextHistory, h);
        newArgSteps.push(nextX);

        funcIds.forEach((id, i) => {
            newValues[id].push(nextY[i]);
        });
        y = nextY;
    }
    functionsValues.value = newValues
    argumentValues.value = newArgSteps
}, { deep: true });
</script>

<template>
    <div class="w-full flex h-full">
        <div class="bg-surface-200 p-2 w-1/3 flex flex-col gap-4">
            <div class="flex-grow min-h-0 bg-surface-300 p-2 flex flex-col gap-1">
                <div class="flex justify-between items-center p-1">
                    <p class="text-2xl text-primary-800">
                        Метод
                    </p>
                    <Select v-model="selectedMethod"
                        :options="methodOptions"
                        optionLabel="name"
                        placeholder="Выберите метод"
                        class="w-full md:w-56" />
                </div>
                <div class="flex justify-between items-center p-1">
                    <p class="text-2xl text-primary-800">
                        Формулы
                    </p>
                    <div class="flex gap-2">
                        <Button icon="pi pi-eraser"
                            @click="formulas.length = 0"
                            severity="danger"
                            rounded
                            aria-label="Очистить" />
                        <Button icon="pi pi-plus"
                            @click="addFormula"
                            severity="success"
                            rounded
                            aria-label="Добавить" />
                    </div>
                </div>
                <hr>
                <ScrollPanel class="flex-1 overflow-auto">
                    <div class="flex flex-col gap-1">
                        <div v-for="formula, pos in formulas">
                            <div class="flex w-full items-center gap-1">
                                <div>
                                    <MathLiveInput :model-value="formulas[pos].func + '\'='"
                                        :options="{ readOnly: true }"
                                        class="w-full"></MathLiveInput>
                                </div>
                                <div class="grow">
                                    <MathLiveInput v-model:="formulas[pos].text"
                                        class="w-full"></MathLiveInput>
                                </div>
                                <!-- <div>
                                    <Button icon="pi pi-bars"
                                        aria-label="Filter"
                                        size="small"
                                        @click="editFormula(pos)" />
                                </div> -->
                            </div>
                        </div>
                    </div>
                </ScrollPanel>
            </div>
            <div class="flex-grow min-h-0 bg-surface-300 p-2 gap-1 flex flex-col">
                <div class="flex justify-between items-center p-1">
                    <p class="text-2xl text-primary-800">
                        Свободные переменные
                    </p>
                </div>
                <hr>
                <ScrollPanel class="flex-1 overflow-auto">
                    <div class="flex flex-col gap-1">
                        <div v-for="variable, pos in freeVariables">
                            <div class="flex w-full items-center gap-1">
                                <div class="flex gap-3 items-center justify-between w-full px-3">
                                    <MathLiveInput v-model:="freeVariables[pos].name"
                                        :options="{ readOnly: true }"
                                        class="w-full"></MathLiveInput>
                                    <InputNumber v-model:="freeVariables[pos].value"
                                        :maxFractionDigits="5"
                                        showButtons></InputNumber>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollPanel>
            </div>
        </div>
        <div class="grow">
            <div class="p-4 h-full w-full">
                <Chart type="line"
                    :data="chartData"
                    :options="chartOptions"
                    class="h-full w-full" />
            </div>
        </div>
        <Dialog v-model:visible="editDialogVisible"
            modal
            header="Настройки формулы"
            @hide="closeDialog"
            :style="{ width: '25rem' }">
        </Dialog>
    </div>
</template>
