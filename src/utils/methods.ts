export type Vector = number[];
export type Context = { [id: string]: number }[];
export type DerivativeFunction = (t: number, y_i: number, context: Context) => number;
export type DerivativeSystem = DerivativeFunction[];

function vectorAdd(a: Vector, b: Vector): Vector {
    return a.map((val, i) => val + b[i]);
}

function vectorScale(v: Vector, scalar: number): Vector {
    return v.map(val => val * scalar);
}

function vectorCombine(...terms: [Vector, number][]): Vector {
    const result = Array(terms[0][0].length).fill(0);
    for (let i = 0; i < result.length; i++) {
        result[i] = terms.reduce((sum, [vec, coef]) => sum + coef * vec[i], 0);
    }
    return result;
}

function applyFList(fList: DerivativeSystem, t: number, y: Vector, context: Context): Vector {
    return fList.map((f_i, i) => f_i(t, y[i], context));
}

export function rungeKuttaStep(fList: DerivativeSystem, x: number, y: Vector, context: Context, h: number): [number, Vector] {
    const k1 = applyFList(fList, x, y, context);
    const k2 = applyFList(fList, x + h / 2, vectorAdd(y, vectorScale(k1, h / 2)), context);
    const k3 = applyFList(fList, x + h / 2, vectorAdd(y, vectorScale(k2, h / 2)), context);
    const k4 = applyFList(fList, x + h, vectorAdd(y, vectorScale(k3, h)), context);

    const nextY = vectorAdd(y, vectorScale(vectorCombine(
        [k1, 1],
        [k2, 2],
        [k3, 2],
        [k4, 1]
    ), h / 6));

    return [x + h, nextY];
}

export function eulerStep(fList: DerivativeSystem, x: number, y: Vector, context: Context, h: number): [number, Vector] {
    const k = applyFList(fList, x, y, context);
    const nextY = vectorAdd(y, vectorScale(k, h));
    return [x + h, nextY];
}

export function modifiedEulerStep(fList: DerivativeSystem, x: number, y: Vector, context: Context, h: number): [number, Vector] {
    const k1 = applyFList(fList, x, y, context);
    const k2 = applyFList(fList, x + h, vectorAdd(y, vectorScale(k1, h)), context);

    const avgK = vectorScale(vectorAdd(k1, k2), 0.5);
    const nextY = vectorAdd(y, vectorScale(avgK, h));

    return [x + h, nextY];
}
