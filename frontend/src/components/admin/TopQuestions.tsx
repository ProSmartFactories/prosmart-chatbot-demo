'use client';

import { motion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import { TopQuestion } from '@/lib/admin';

interface TopQuestionsProps {
  questions: TopQuestion[];
}

export function TopQuestions({ questions }: TopQuestionsProps) {
  const maxCount = questions.length > 0 ? questions[0].count : 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">Preguntas Frecuentes</h3>
          <p className="text-slate-500 text-xs">Top 10 consultas de usuarios</p>
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, index) => {
          const pct = Math.round((q.count / maxCount) * 100);
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * index }}
              className="group"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-slate-300 text-sm truncate flex-1 mr-3 capitalize">
                  {q.question}
                </p>
                <span className="text-orange-400 text-sm font-semibold flex-shrink-0">
                  {q.count}
                </span>
              </div>
              <div className="h-2 bg-slate-900/60 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: 0.1 * index, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, #F97316 0%, #EA580C ${pct}%)`,
                  }}
                />
              </div>
            </motion.div>
          );
        })}

        {questions.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            Sin datos de preguntas aun
          </div>
        )}
      </div>
    </motion.div>
  );
}
