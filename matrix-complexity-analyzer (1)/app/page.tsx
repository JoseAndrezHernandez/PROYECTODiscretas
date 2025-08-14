"use client"
import { MatrixMultiplicationAnalyzer } from "@/components/matrix-analyzer"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Analizador de Complejidad de Multiplicación de Matrices
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Analiza empíricamente la complejidad temporal de la multiplicación de matrices n×n y visualiza el
            crecimiento del tiempo de ejecución
          </p>
        </div>

        <MatrixMultiplicationAnalyzer />
      </div>
    </main>
  )
}
