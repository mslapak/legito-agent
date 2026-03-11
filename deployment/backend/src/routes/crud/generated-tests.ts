import { createCrudRouter } from '../../utils/crud';

export const generatedTestsRouter = createCrudRouter({
  table: 'public.generated_tests',
  insertCols: ['project_id', 'task_id', 'test_suite_id', 'title', 'prompt', 'expected_result', 'priority', 'status', 'source_type', 'azure_devops_id', 'result_summary', 'result_reasoning', 'last_run_at', 'execution_time_ms', 'step_count', 'estimated_cost', 'evaluation_details', 'confidence_score', 'final_score'],
  updateCols: ['title', 'prompt', 'expected_result', 'priority', 'status', 'task_id', 'test_suite_id', 'result_summary', 'result_reasoning', 'last_run_at', 'execution_time_ms', 'step_count', 'estimated_cost', 'evaluation_details', 'confidence_score', 'final_score'],
  userScoped: true,
  parentFilter: { param: 'project_id', column: 'project_id' },
});
