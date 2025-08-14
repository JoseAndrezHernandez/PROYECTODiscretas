"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Play, Download, Trash2, Zap } from "lucide-react"

interface DataPoint {
  n: number
  time: number
  operations: number
  flops: number
  gflops: number
  teraflops: number
  teraflopsSeconds: number // Nuevo: tiempo * TERAFLOPS/segundo
  theoretical: number
  standardDeviation?: number
}

interface AnalysisResult {
  dataPoints: DataPoint[]
  complexity: string
  rSquared: number
  coefficients: {
    a: number
    b: number
    c: number
  }
  theoreticalCoeff: number
  avgGFLOPS: number
  maxTFLOPS: number
  totalTeraflopsSeconds: number // Nuevo: trabajo computacional total
}

export function MatrixMultiplicationAnalyzer() {
  const [startN, setStartN] = useState(100)
  const [endN, setEndN] = useState(800)
  const [step, setStep] = useState(100)
  const [measurements, setMeasurements] = useState(3)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<AnalysisResult | null>(null)
  const [currentTest, setCurrentTest] = useState("")

  const multiplyMatricesWithFLOPS = (
    a: number[][],
    b: number[][],
    n: number,
  ): { result: number[][]; flops: number } => {
    const result: number[][] = []
    let flops = 0

    // Inicializar matriz resultado
    for (let i = 0; i < n; i++) {
      result[i] = []
      for (let j = 0; j < n; j++) {
        result[i][j] = 0
      }
    }

    // Multiplicación estándar con conteo preciso de FLOPS
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          result[i][j] += a[i][k] * b[k][j]
          flops += 2 // 1 multiplicación + 1 suma = 2 operaciones de punto flotante
        }
      }
    }

    return { result, flops }
  }

  const generateRandomMatrix = (n: number): number[][] => {
    const matrix: number[][] = []
    for (let i = 0; i < n; i++) {
      matrix[i] = []
      for (let j = 0; j < n; j++) {
        matrix[i][j] = Math.random() * 10
      }
    }
    return matrix
  }

  const measureFLOPS = (
    n: number,
    numMeasurements: number,
  ): {
    avgTime: number
    stdDev: number
    flops: number
    avgFLOPS: number
    gflops: number
    teraflops: number
    teraflopsSeconds: number // Nuevo campo
  } => {
    const times: number[] = []
    const flopsResults: number[] = []
    const teraflopsSecondsResults: number[] = []
    let totalFLOPS = 0

    for (let i = 0; i < numMeasurements; i++) {
      const matrixA = generateRandomMatrix(n)
      const matrixB = generateRandomMatrix(n)

      const startTime = performance.now()
      const { flops } = multiplyMatricesWithFLOPS(matrixA, matrixB, n)
      const endTime = performance.now()

      const timeInSeconds = (endTime - startTime) / 1000
      const currentFLOPS = flops / timeInSeconds

      const teraflopsPerSecond = currentFLOPS / 1e12
      const teraflopsSeconds = timeInSeconds * teraflopsPerSecond

      times.push(endTime - startTime)
      flopsResults.push(currentFLOPS)
      teraflopsSecondsResults.push(teraflopsSeconds)
      totalFLOPS = flops
    }

    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length
    const variance = times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length
    const stdDev = Math.sqrt(variance)

    const avgFLOPS = flopsResults.reduce((sum, flops) => sum + flops, 0) / flopsResults.length
    const gflops = avgFLOPS / 1e9
    const teraflops = avgFLOPS / 1e12

    const teraflopsSeconds = teraflopsSecondsResults.reduce((sum, tfs) => sum + tfs, 0) / teraflopsSecondsResults.length

    return { avgTime, stdDev, flops: totalFLOPS, avgFLOPS, gflops, teraflops, teraflopsSeconds }
  }

  const fitCubicCurve = (dataPoints: DataPoint[]) => {
    const n = dataPoints.length
    if (n < 3) return { a: 0, b: 0, c: 0, rSquared: 0 }

    // Regresión simple para n³
    let sumN3 = 0,
      sumN6 = 0,
      sumTN3 = 0,
      sumT = 0

    dataPoints.forEach((point) => {
      const n3 = Math.pow(point.n, 3)
      sumN3 += n3
      sumN6 += Math.pow(n3, 2)
      sumTN3 += point.time * n3
      sumT += point.time
    })

    const denominator = n * sumN6 - sumN3 * sumN3
    const a = denominator !== 0 ? (n * sumTN3 - sumT * sumN3) / denominator : 0

    const avgTime = sumT / n
    const avgN3 = sumN3 / n
    const c = avgTime - a * avgN3
    const b = 0

    // Calcular R²
    let ssRes = 0,
      ssTot = 0
    const avgY = dataPoints.reduce((sum, p) => sum + p.time, 0) / n

    dataPoints.forEach((point) => {
      const predicted = a * Math.pow(point.n, 3) + b * Math.pow(point.n, 2) + c
      ssRes += Math.pow(point.time - predicted, 2)
      ssTot += Math.pow(point.time - avgY, 2)
    })

    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0

    return { a: Math.abs(a), b: Math.abs(b), c: Math.abs(c), rSquared }
  }

  const runAnalysis = useCallback(async () => {
    if (isRunning) return

    setIsRunning(true)
    setProgress(0)
    setResults(null)
    setCurrentTest("")

    try {
      const dataPoints: DataPoint[] = []
      const totalTests = Math.floor((endN - startN) / step) + 1
      let totalTeraflopsSeconds = 0 // Acumulador de trabajo total

      for (let n = startN; n <= endN; n += step) {
        setCurrentTest(`Calculando TERAFLOPS-segundos para matrices ${n}×${n} (${measurements} mediciones)`)

        const { avgTime, stdDev, flops, avgFLOPS, gflops, teraflops, teraflopsSeconds } = measureFLOPS(n, measurements)

        const theoreticalOps = 2 * Math.pow(n, 3) - Math.pow(n, 2)
        const theoretical = theoreticalOps * 0.000001 // Escalar para visualización

        totalTeraflopsSeconds += teraflopsSeconds // Acumular trabajo total

        dataPoints.push({
          n,
          time: avgTime,
          operations: flops,
          flops: avgFLOPS,
          gflops,
          teraflops,
          teraflopsSeconds, // Nuevo campo
          theoretical, // Agregar valor teórico 2n³ - n²
          standardDeviation: stdDev,
        })

        const currentProgress = ((n - startN) / (endN - startN)) * 100
        setProgress(Math.min(currentProgress, 100))

        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      // Analizar complejidad
      const coefficients = fitCubicCurve(dataPoints)

      const theoreticalCoeff =
        dataPoints.length > 1
          ? dataPoints[dataPoints.length - 1].time / Math.pow(dataPoints[dataPoints.length - 1].n, 3)
          : 0

      const avgGFLOPS = dataPoints.reduce((sum, p) => sum + p.gflops, 0) / dataPoints.length
      const maxTFLOPS = Math.max(...dataPoints.map((p) => p.teraflops))

      let complexity = "O(n³)"
      if (coefficients.rSquared > 0.9) {
        complexity = "O(n³)"
      } else if (coefficients.rSquared > 0.7) {
        complexity = "≈ O(n³)"
      } else {
        complexity = "Complejo"
      }

      setResults({
        dataPoints,
        complexity,
        rSquared: coefficients.rSquared,
        coefficients,
        theoreticalCoeff,
        avgGFLOPS,
        maxTFLOPS,
        totalTeraflopsSeconds, // Nuevo campo en resultados
      })
    } catch (error) {
      console.error("Error durante el análisis:", error)
    } finally {
      setIsRunning(false)
      setCurrentTest("")
      setProgress(0)
    }
  }, [startN, endN, step, measurements, isRunning])

  const exportData = () => {
    if (!results) return

    const csvContent = [
      "n,tiempo_ms,desviacion_std,flops_totales,flops_por_segundo,gflops,teraflops,teraflops_segundos,operaciones_teoricas",
      ...results.dataPoints.map(
        (point) =>
          `${point.n},${point.time},${point.standardDeviation || 0},${point.operations},${point.flops},${point.gflops},${point.teraflops},${point.teraflopsSeconds},${2 * Math.pow(point.n, 3) - Math.pow(point.n, 2)}`,
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "matrix_teraflops_seconds_analysis.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearResults = () => {
    setResults(null)
    setProgress(0)
    setCurrentTest("")
  }

  return (
    <div className="space-y-6">
      {/* Panel de Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Analizador de FLOPS - Multiplicación de Matrices
          </CardTitle>
          <CardDescription>Mide directamente las operaciones de punto flotante por segundo (FLOPS)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium mb-2 block">N inicial</label>
              <Input
                type="number"
                value={startN}
                onChange={(e) => setStartN(Math.max(50, Number(e.target.value)))}
                min="50"
                max="1000"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">N final</label>
              <Input
                type="number"
                value={endN}
                onChange={(e) => setEndN(Math.max(startN, Number(e.target.value)))}
                min="100"
                max="1500"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Incremento</label>
              <Input
                type="number"
                value={step}
                onChange={(e) => setStep(Math.max(25, Number(e.target.value)))}
                min="25"
                max="200"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Mediciones</label>
              <Input
                type="number"
                value={measurements}
                onChange={(e) => setMeasurements(Math.max(1, Math.min(10, Number(e.target.value))))}
                min="1"
                max="10"
                disabled={isRunning}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={runAnalysis} disabled={isRunning} className="w-full">
                <Play className="w-4 h-4 mr-2" />
                {isRunning ? "Calculando FLOPS..." : "Iniciar Análisis"}
              </Button>
            </div>
          </div>

          {isRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{currentTest}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultados */}
      {results && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Análisis de Rendimiento TERAFLOPS-Segundos</CardTitle>
              <CardDescription>Trabajo computacional: tiempo × TERAFLOPS/segundo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.complexity}</div>
                  <div className="text-sm text-gray-500">Complejidad</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{(results.rSquared * 100).toFixed(1)}%</div>
                  <div className="text-sm text-gray-500">R² (Ajuste)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{results.avgGFLOPS.toFixed(2)}</div>
                  <div className="text-sm text-gray-500">GFLOPS Promedio</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{(results.maxTFLOPS * 1000).toFixed(2)}</div>
                  <div className="text-sm text-gray-500">MFLOPS Máximo</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {(results.totalTeraflopsSeconds * 1e6).toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-500">μTFLOPS-seg Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">{results.dataPoints.length}</div>
                  <div className="text-sm text-gray-500">Mediciones</div>
                </div>
              </div>

              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-blue-600" />
                  <h4 className="font-semibold text-blue-800">⚡ TERAFLOPS-Segundos Explicado</h4>
                </div>
                <div className="text-sm text-blue-700 space-y-1">
                  <div>
                    • <strong>Fórmula:</strong> TERAFLOPS-segundos = tiempo(s) × TERAFLOPS/segundo
                  </div>
                  <div>
                    • <strong>Significado:</strong> Trabajo computacional total realizado
                  </div>
                  <div>
                    • <strong>Unidad:</strong> Representa "cantidad de cómputo" independiente de velocidad
                  </div>
                  <div>
                    • <strong>Ventaja:</strong> Mide el esfuerzo computacional real, no solo la velocidad
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={exportData} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Exportar TERAFLOPS-segundos
                </Button>
                <Button onClick={clearResults} variant="outline" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpiar
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Tiempo de Ejecución vs Teoría</CardTitle>
                <CardDescription>Datos empíricos (azul) vs Curva teórica 2n³-n² (verde)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results.dataPoints}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="n" label={{ value: "n", position: "insideBottom", offset: -10 }} />
                      <YAxis label={{ value: "Tiempo (ms)", angle: -90, position: "insideLeft" }} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `${value.toFixed(2)} ${name === "time" ? "ms" : "unidades"}`,
                          name === "time" ? "Tiempo Empírico" : "Teoría 2n³-n²",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="time"
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={{ fill: "#2563eb", strokeWidth: 2, r: 4 }}
                        name="time"
                      />
                      <Line
                        type="monotone"
                        dataKey="theoretical"
                        stroke="#16a34a"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: "#16a34a", strokeWidth: 2, r: 3 }}
                        name="theoretical"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Trabajo Computacional</CardTitle>
                <CardDescription>TERAFLOPS-segundos (tiempo × rendimiento)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results.dataPoints}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="n" label={{ value: "n", position: "insideBottom", offset: -10 }} />
                      <YAxis label={{ value: "μTFLOPS-seg", angle: -90, position: "insideLeft" }} />
                      <Tooltip formatter={(value: number) => [`${(value * 1e6).toFixed(4)} μTFLOPS-seg`, "Trabajo"]} />
                      <Line
                        type="monotone"
                        dataKey="teraflopsSeconds"
                        stroke="#dc2626"
                        strokeWidth={3}
                        dot={{ fill: "#dc2626", strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Comparación: Empírico vs Teórico</CardTitle>
              <CardDescription>Validación de la fórmula 2n³ - n² contra datos reales</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results.dataPoints}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="n"
                      label={{ value: "Tamaño de Matriz (n)", position: "insideBottom", offset: -10 }}
                    />
                    <YAxis label={{ value: "Operaciones/Tiempo", angle: -90, position: "insideLeft" }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${value.toFixed(2)} ${name === "time" ? "ms (empírico)" : "unidades (2n³-n²)"}`,
                        name === "time" ? "Datos Reales" : "Fórmula Teórica",
                      ]}
                    />
                    {/* Datos empíricos */}
                    <Line
                      type="monotone"
                      dataKey="time"
                      stroke="#2563eb"
                      strokeWidth={4}
                      dot={{ fill: "#2563eb", strokeWidth: 2, r: 5 }}
                      name="time"
                    />
                    {/* Curva teórica 2n³ - n² */}
                    <Line
                      type="monotone"
                      dataKey="theoretical"
                      stroke="#16a34a"
                      strokeWidth={3}
                      strokeDasharray="8 4"
                      dot={{ fill: "#16a34a", strokeWidth: 2, r: 4 }}
                      name="theoretical"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-0.5 bg-blue-600"></div>
                  <span className="text-sm font-medium text-blue-800">
                    Línea Azul: Datos Empíricos (tiempo real medido)
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-0.5 bg-green-600 border-dashed border-t-2"></div>
                  <span className="text-sm font-medium text-green-800">Línea Verde: Curva Teórica 2n³ - n²</span>
                </div>
                <div className="text-sm text-green-700">
                  <strong>Interpretación:</strong> Si las líneas siguen un patrón similar, confirma que la
                  multiplicación de matrices efectivamente sigue la complejidad teórica <strong>O(2n³ - n²)</strong>.
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Análisis Matemático</CardTitle>
              <CardDescription>Fórmulas empíricas vs teóricas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold mb-2">Ecuación Empírica (Tiempo):</h4>
                  <p className="font-mono text-sm">
                    T(n) ≈ {results.coefficients.a.toExponential(2)}n³ + {results.coefficients.c.toFixed(2)}
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    R² = {(results.rSquared * 100).toFixed(1)}%
                  </Badge>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-semibold mb-2">Fórmula Teórica:</h4>
                  <p className="font-mono text-sm">Operaciones = 2n³ - n²</p>
                  <Badge variant="outline" className="mt-2">
                    Complejidad: O(n³)
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
