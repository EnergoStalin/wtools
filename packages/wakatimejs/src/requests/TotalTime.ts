export declare interface ProjectTotalTime {
  data: ProjectTotalTimeData;
  error: any
}

export declare interface ProjectTotalTimeData {
  project: string;
  total_seconds: number;
  text: string;
  decimal: string;
  digital: string;
  daily_average: number;
  is_up_to_date: boolean;
  percent_calculated: number;
  range: ProjectTotalTimeDataRange;
  timeout: number;
}

export declare interface ProjectTotalTimeDataRange {
  start: Date;
  start_date: Date;
  start_text: string;
  end: Date;
  end_date: Date;
  end_text: string;
  timezone: string;
}
