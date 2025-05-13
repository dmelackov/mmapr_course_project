import { defineStore } from "pinia";
import { reactive, ref } from "vue";

export interface FormulaData {
    func: string
    text: string
}

export const useFormula = defineStore("formula", () => {
    const formulas = ref<FormulaData[]>([])
    const activeTab = ref("0")
    return { formulas, activeTab }
})